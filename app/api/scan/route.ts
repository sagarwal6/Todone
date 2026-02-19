/**
 * Insight Scan API Route
 *
 * Combines metadata collection and AI analysis into a single
 * SSE-streaming endpoint. Returns cached results if available.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Anthropic from '@anthropic-ai/sdk';
import { logCost } from '@/lib/ai/cost-logger';
import { v4 as uuidv4, validate as isValidUUID } from 'uuid';
import { buildScanContext } from '@/lib/scan/metadata';
import {
  getInsightAnalysisSystemPrompt,
  getInsightAnalysisUserPrompt,
  parseBundledAnalysisResponse,
  flattenBundledResult,
} from '@/lib/scan/prompts';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/google/auth';
import type { ScanProgressEvent, InsightAction, InsightPortrait, ActionBundle } from '@/lib/scan/types';
import { detectLocationFromCalendar } from '@/lib/utils/detectLocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy-initialize Anthropic client
let _anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.TODONE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('TODONE_ANTHROPIC_API_KEY environment variable is not set');
    }
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

export async function POST(request: NextRequest) {
  // Check for force refresh parameter
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('force') === 'true';

  // Parse request body (currently unused but kept for future options)
  try {
    await request.json();
  } catch {
    // No body or invalid JSON - that's fine
  }

  // Get session (supports both web NextAuth and mobile JWT)
  const session = await getServerSession(authOptions);
  console.log('[SCAN] Session check:', { hasSession: !!session });

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use profile ID from hybrid session
  const profile = { id: session.user.id };

  console.log('[SCAN] Profile from session:', {
    email: session.user.email,
    profileId: profile.id,
  });

  // Check for cached scan (less than 1 hour old) - skip if force refresh
  const { data: cachedScan } = forceRefresh
    ? { data: null }
    : await supabaseAdmin.rpc('get_cached_insight_scan', { p_user_id: profile.id });

  if (cachedScan && cachedScan.length > 0) {
    const scan = cachedScan[0];
    // Get cached actions
    const { data: actions } = await supabaseAdmin
      .rpc('get_insight_actions', { p_scan_id: scan.id });

    // Query durable task preps so cached results show already-prepped items correctly
    const { data: preppedTasks } = await supabaseAdmin
      .from('tasks')
      .select('id, source_ref')
      .eq('user_id', profile.id)
      .eq('source', 'insight')
      .not('source_ref', 'is', null)
      .is('deleted_at', null);

    const cachedPreppedMap = new Map<string, string>();
    if (preppedTasks) {
      for (const task of preppedTasks) {
        if (task.source_ref) {
          cachedPreppedMap.set(task.source_ref, task.id);
        }
      }
    }

    // Annotate cached actions with preppedTaskId (same logic as addPreppedInfo for fresh scans)
    const annotateCached = (action: InsightAction) => {
      if (action.context) {
        const ctx = action.context as { eventId?: string; threadId?: string };
        const refKey = ctx.eventId || ctx.threadId;
        if (refKey && cachedPreppedMap.has(refKey)) {
          (action.context as { alreadyPrepped?: boolean; preppedTaskId?: string }).alreadyPrepped = true;
          (action.context as { alreadyPrepped?: boolean; preppedTaskId?: string }).preppedTaskId = cachedPreppedMap.get(refKey)!;
        }
      }
    };

    const cachedQuickWin = scan.quick_win as InsightAction | null;
    const cachedBundles = (scan.bundles || []) as ActionBundle[];
    if (cachedQuickWin) annotateCached(cachedQuickWin);
    cachedBundles.forEach(bundle => bundle.items.forEach(annotateCached));

    return new Response(JSON.stringify({
      cached: true,
      scan: {
        id: scan.id,
        status: scan.status,
        portrait: scan.portrait,
        actions: actions || [],
        contextSummary: scan.context_summary,
        createdAt: scan.created_at,
        expiresAt: scan.expires_at,
        greeting: scan.greeting,
        quickWin: cachedQuickWin,
        bundles: cachedBundles,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get access token
  const accessToken = await getValidAccessToken(profile.id);
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'No valid access token. Please reconnect your Google account.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create SSE stream for fresh scan
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ScanProgressEvent) => {
        const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      };

      let scanId: string | null = null;

      try {
        // Create scan record
        scanId = uuidv4();
        await supabaseAdmin.from('insight_scans').insert({
          id: scanId,
          user_id: profile.id,
          status: 'in_progress',
        });

        // Query tasks with source='insight' and source_ref set to find existing preps
        // This is durable — tasks survive scan TTL expiry and cascade deletes
        const { data: preppedTasks } = await supabaseAdmin
          .from('tasks')
          .select('id, source_ref, title')
          .eq('user_id', profile.id)
          .eq('source', 'insight')
          .not('source_ref', 'is', null)
          .is('deleted_at', null);

        // Build map: sourceRef -> { taskId, title }
        const preppedRefMap = new Map<string, { taskId: string; title: string }>();
        if (preppedTasks) {
          for (const task of preppedTasks) {
            if (task.source_ref) {
              preppedRefMap.set(task.source_ref, { taskId: task.id, title: task.title });
            }
          }
        }

        // Legacy compatibility: build eventId -> actionId map (empty now, preppedTaskId used instead)
        const preppedEventMap = new Map<string, string>();

        console.log(`[SCAN] Found ${preppedRefMap.size} already-prepped items via tasks`);

        // Phase 1: Metadata collection
        emit({ type: 'metadata_started', timestamp: Date.now() });

        const context = await buildScanContext(accessToken, {
          userEmail: session.user?.email || undefined,
          preppedEventMap: Object.fromEntries(preppedEventMap), // eventId -> actionId (legacy, now empty)
          preppedRefMap: Object.fromEntries(preppedRefMap), // sourceRef -> { taskId, title }
          onGmailProgress: (count) => {
            emit({ type: 'metadata_progress', source: 'gmail', count });
          },
          onCalendarProgress: (count) => {
            emit({ type: 'metadata_progress', source: 'calendar', count });
          },
        });

        // Report any errors
        if (context.errors?.gmail) {
          emit({ type: 'metadata_error', source: 'gmail', error: context.errors.gmail });
        }
        if (context.errors?.calendar) {
          emit({ type: 'metadata_error', source: 'calendar', error: context.errors.calendar });
        }

        emit({
          type: 'metadata_complete',
          emailCount: context.emails.totalScanned,
          eventCount: context.calendar.totalEvents,
        });

        // TODO: Auto-detect and save user location from calendar events
        // Requires adding 'location' column to profiles table:
        // ALTER TABLE profiles ADD COLUMN location TEXT;
        // if (context.calendar.rawEvents) {
        //   const detectedLocation = await detectLocationFromCalendar(context.calendar.rawEvents);
        //   if (detectedLocation) {
        //     console.log(`[SCAN] Auto-detected user location: ${detectedLocation}`);
        //     await supabaseAdmin.from('profiles').update({ location: detectedLocation }).eq('id', profile.id);
        //   }
        // }

        console.log('[SCAN] Emails awaiting response:', context.emails.awaitingResponse.length);

        // Phase 2: AI Analysis
        emit({ type: 'analysis_started', timestamp: Date.now() });

        const analysisResult = await analyzeContext(context, emit);

        // Post-process actions to add alreadyPrepped info from tasks
        // This ensures UI can show "View prep" instead of "Prep" for already-prepped items
        const addPreppedInfo = (action: InsightAction) => {
          if (action.context) {
            const ctx = action.context as { eventId?: string; threadId?: string };
            const refKey = ctx.eventId || ctx.threadId;
            if (refKey && preppedRefMap.has(refKey)) {
              const prepped = preppedRefMap.get(refKey)!;
              (action.context as { alreadyPrepped?: boolean; preppedTaskId?: string }).alreadyPrepped = true;
              (action.context as { alreadyPrepped?: boolean; preppedTaskId?: string }).preppedTaskId = prepped.taskId;
              console.log(`[SCAN] Marked as already-prepped: ${action.headline} (task: ${prepped.taskId})`);
            }
          }
        };

        // Apply to all actions
        analysisResult.actions.forEach(addPreppedInfo);
        if (analysisResult.quickWin) addPreppedInfo(analysisResult.quickWin);
        analysisResult.bundles.forEach(bundle => bundle.items.forEach(addPreppedInfo));

        // STEP 1: Build ID mapping FIRST (before any database operations)
        // This ensures all IDs are UUIDs for both insight_actions AND quick_win/bundles
        const idMapping: Record<string, string> = {};
        const actionRecords: {
          id: string;
          scan_id: string;
          type: string;
          priority: string;
          headline: string;
          detail: string;
          execution_context: unknown;
          status: string;
        }[] = [];

        if (analysisResult.actions.length > 0) {
          for (const action of analysisResult.actions) {
            // Generate a new UUID if the ID isn't a valid UUID
            const dbId = isValidUUID(action.id) ? action.id : uuidv4();
            idMapping[action.id] = dbId;

            actionRecords.push({
              id: dbId,
              scan_id: scanId!,
              type: action.type,
              priority: action.priority,
              headline: action.headline,
              detail: action.detail,
              execution_context: action.context,
              status: 'pending',
            });
          }
        }

        // STEP 2: Update analysisResult objects with correct UUIDs
        // This updates the same object references used in quickWin and bundles
        if (analysisResult.quickWin && idMapping[analysisResult.quickWin.id]) {
          analysisResult.quickWin.id = idMapping[analysisResult.quickWin.id];
        }
        for (const bundle of analysisResult.bundles) {
          for (const item of bundle.items) {
            if (idMapping[item.id]) {
              item.id = idMapping[item.id];
            }
          }
        }

        // STEP 3: NOW persist to database with corrected UUIDs
        await supabaseAdmin
          .from('insight_scans')
          .update({
            status: context.errors ? 'partial' : 'complete',
            portrait: analysisResult.portrait,
            greeting: analysisResult.greeting,
            quick_win: analysisResult.quickWin,
            bundles: analysisResult.bundles,
            context_summary: {
              emailsScanned: context.emails.totalScanned,
              eventsScanned: context.calendar.totalEvents,
              errors: context.errors ? Object.values(context.errors) : undefined,
            },
          })
          .eq('id', scanId);

        // STEP 4: Insert action records
        if (actionRecords.length > 0) {
          const { error: insertError } = await supabaseAdmin.from('insight_actions').insert(actionRecords);
          if (insertError) {
            console.error('[SCAN] Failed to insert actions:', insertError);
          }
        }

        // STEP 5: Emit the analysis_complete with corrected UUIDs
        emit({
          type: 'analysis_complete',
          result: {
            greeting: analysisResult.greeting,
            quickWin: analysisResult.quickWin,
            bundles: analysisResult.bundles,
          },
        });

        // Emit complete
        emit({
          type: 'complete',
          scanId: scanId!,
          totalActions: analysisResult.actions.length,
        });
      } catch (error) {
        console.error('Scan error:', error);

        // Update scan as failed if we created one
        if (scanId) {
          await supabaseAdmin
            .from('insight_scans')
            .update({
              status: 'failed',
              error_message: 'Scan failed',
            })
            .eq('id', scanId);
        }

        emit({
          type: 'error',
          error: 'Scan failed',
          phase: 'analysis',
          recoverable: false,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Run AI analysis on the scan context
 */
async function analyzeContext(
  context: import('@/lib/scan/types').ScanContext,
  emit: (event: ScanProgressEvent) => void
): Promise<{
  portrait: InsightPortrait;
  actions: InsightAction[];
  greeting: string;
  quickWin: InsightAction | null;
  bundles: ActionBundle[];
}> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    system: getInsightAnalysisSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: getInsightAnalysisUserPrompt(context),
      },
    ],
  });

  // Log cost
  const scanCacheUsage = response.usage as { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  logCost({
    callType: 'scan',
    model: 'claude-haiku-4-5-20251001',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: scanCacheUsage.cache_read_input_tokens,
    cacheCreationTokens: scanCacheUsage.cache_creation_input_tokens,
  });

  // Extract text content
  const textContent = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  // Parse the response (new bundled format)
  const result = parseBundledAnalysisResponse(textContent);

  // Flatten to legacy actions array for DB storage
  const actions = flattenBundledResult(result);

  // Emit portrait (analysis_complete with correct IDs is emitted after ID mapping in the stream handler)
  emit({ type: 'portrait_ready', portrait: result.portrait });

  // NOTE: Don't emit action_ready here - IDs need to be mapped to UUIDs first
  // The analysis_complete event is emitted after ID mapping in the stream handler

  return {
    portrait: result.portrait,
    actions,
    greeting: result.greeting,
    quickWin: result.quickWin,
    bundles: result.bundles,
  };
}
