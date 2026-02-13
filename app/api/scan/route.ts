/**
 * Insight Scan API Route
 *
 * Combines metadata collection and AI analysis into a single
 * SSE-streaming endpoint. Returns cached results if available.
 */

import { NextRequest } from 'next/server';
import { getHybridSession } from '@/lib/auth/getSession';
import Anthropic from '@anthropic-ai/sdk';
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

  // Parse request body for frontend-provided protected senders
  let frontendProtectedSenders: string[] = [];
  try {
    const body = await request.json();
    frontendProtectedSenders = body?.protectedSenders || [];
  } catch {
    // No body or invalid JSON - that's fine, use empty array
  }

  // Get session (supports both web NextAuth and mobile JWT)
  const session = await getHybridSession();
  console.log('[SCAN] Session check:', { hasSession: !!session, email: session?.user?.email });

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
        // New bundled format
        greeting: scan.greeting,
        quickWin: scan.quick_win,
        bundles: scan.bundles || [],
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

        // Get already-prepped meeting eventIds with their action IDs for THIS USER
        // So we can show "View prep" instead of "Prep" button
        // Two-step query: first get user's scan IDs, then get prepped actions from those scans
        const { data: userScans } = await supabaseAdmin
          .from('insight_scans')
          .select('id')
          .eq('user_id', profile.id);

        const preppedEventMap = new Map<string, string>(); // eventId -> actionId

        // Also get thread IDs of active email tasks (draft_response type with pending/in_progress status)
        const taskThreadIds = new Set<string>();
        const protectedSenders = new Set<string>(); // Sender names with active tasks

        // Add frontend-provided protected senders first (most reliable - comes from localStorage tasks)
        for (const sender of frontendProtectedSenders) {
          protectedSenders.add(sender);
          console.log(`[SCAN] Protected sender from frontend: "${sender}"`);
        }

        if (userScans && userScans.length > 0) {
          const scanIds = userScans.map(s => s.id);

          // Get prepped meetings
          const { data: preppedActions } = await supabaseAdmin
            .from('insight_actions')
            .select('id, execution_context')
            .eq('type', 'meeting_prep')
            .in('scan_id', scanIds)
            .in('status', ['completed', 'in_progress'])
            .not('execution_context', 'is', null);

          if (preppedActions) {
            for (const action of preppedActions) {
              const ctx = action.execution_context as { eventId?: string };
              if (ctx?.eventId) {
                preppedEventMap.set(ctx.eventId, action.id);
              }
            }
          }

          // Get active email tasks (draft_response) - include pending and in_progress
          // These emails should still show in Heads up even if user sent last message
          const { data: activeEmailActions } = await supabaseAdmin
            .from('insight_actions')
            .select('execution_context')
            .eq('type', 'draft_response')
            .in('scan_id', scanIds)
            .in('status', ['pending', 'in_progress'])
            .not('execution_context', 'is', null);

          if (activeEmailActions) {
            for (const action of activeEmailActions) {
              const ctx = action.execution_context as { threadId?: string };
              if (ctx?.threadId) {
                taskThreadIds.add(ctx.threadId);
              }
            }
          }
        }

        // ALSO check the tasks table for active "Reply to" tasks
        // These might have been created from previous scans or manually
        // We need to get thread IDs from executed insight_actions that created these tasks
        // Note: Don't filter by status - just exclude completed/done tasks to catch all active ones
        const { data: activeTasks } = await supabaseAdmin
          .from('tasks')
          .select('title, research')
          .eq('user_id', profile.id)
          .not('status', 'in', '("done","failed")') // Exclude only finished tasks
          .like('title', 'Reply to%');

        // For tasks created from insight actions, check if there's a completed action with matching title
        // and extract thread_id from its execution_context
        if (activeTasks && activeTasks.length > 0) {
          // First, extract sender names from task titles as protected senders
          // This ensures emails from these senders are shown even if we can't find thread IDs
          for (const task of activeTasks) {
            const match = task.title.match(/^Reply to ([^:]+)/);
            if (match) {
              const senderName = match[1].trim();
              protectedSenders.add(senderName);
              console.log(`[SCAN] Protected sender from active task: "${senderName}"`);
            }
          }

          // Also try to find thread IDs for more precise matching
          const { data: userScansForTasks } = await supabaseAdmin
            .from('insight_scans')
            .select('id')
            .eq('user_id', profile.id);

          if (userScansForTasks && userScansForTasks.length > 0) {
            const allScanIds = userScansForTasks.map(s => s.id);
            const { data: completedActions } = await supabaseAdmin
              .from('insight_actions')
              .select('execution_context, headline')
              .eq('type', 'draft_response')
              .in('scan_id', allScanIds)
              .eq('status', 'completed')
              .not('execution_context', 'is', null);

            if (completedActions) {
              // Match tasks to completed actions by sender name
              for (const task of activeTasks) {
                // Extract sender name from task title: "Reply to X: ..."
                const match = task.title.match(/^Reply to ([^:]+)/);
                if (match) {
                  const senderName = match[1].trim();
                  // Find action with matching sender
                  for (const action of completedActions) {
                    const ctx = action.execution_context as { senderName?: string; threadId?: string };
                    if (ctx?.senderName && ctx.senderName.includes(senderName) && ctx?.threadId) {
                      taskThreadIds.add(ctx.threadId);
                      console.log(`[SCAN] Found thread ID for active task "${task.title}": ${ctx.threadId}`);
                    }
                  }
                }
              }
            }
          }
        }

        console.log(`[SCAN] Found ${preppedEventMap.size} already-prepped meetings`);
        console.log(`[SCAN] Found ${taskThreadIds.size} active email tasks (thread IDs)`);
        console.log(`[SCAN] Found ${protectedSenders.size} protected senders from active tasks`);

        // Phase 1: Metadata collection
        emit({ type: 'metadata_started', timestamp: Date.now() });

        const context = await buildScanContext(accessToken, {
          userEmail: session.user?.email || undefined,
          preppedEventMap: Object.fromEntries(preppedEventMap), // eventId -> actionId
          taskThreadIds, // Thread IDs of active email tasks - don't exclude these
          protectedSenders, // Sender names from active tasks - don't exclude their emails
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

        // Log emails being sent to LLM for debugging
        console.log('[SCAN] Emails awaiting response being sent to LLM:');
        for (const email of context.emails.awaitingResponse) {
          console.log(`  - "${email.subject}" from ${email.fromName} <${email.from}> | score: ${email.priorityScore} | direct: ${email.isDirectEmail}`);
        }

        // Phase 2: AI Analysis
        emit({ type: 'analysis_started', timestamp: Date.now() });

        const analysisResult = await analyzeContext(context, emit);

        // Post-process meeting_prep actions to add alreadyPrepped info
        // This ensures UI can show "View prep" instead of "Prep" for already-prepped meetings
        const addPreppedInfo = (action: InsightAction) => {
          if (action.type === 'meeting_prep' && action.context) {
            const ctx = action.context as { eventId?: string };
            if (ctx.eventId && preppedEventMap.has(ctx.eventId)) {
              (action.context as { alreadyPrepped?: boolean; preppedActionId?: string }).alreadyPrepped = true;
              (action.context as { alreadyPrepped?: boolean; preppedActionId?: string }).preppedActionId = preppedEventMap.get(ctx.eventId);
              console.log(`[SCAN] Marked meeting as already-prepped: ${action.headline}`);
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
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Update scan as failed if we created one
        if (scanId) {
          await supabaseAdmin
            .from('insight_scans')
            .update({
              status: 'failed',
              error_message: errorMessage,
            })
            .eq('id', scanId);
        }

        emit({
          type: 'error',
          error: errorMessage,
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: getInsightAnalysisSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: getInsightAnalysisUserPrompt(context),
      },
    ],
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
