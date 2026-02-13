/**
 * SSE Streaming Endpoint for Agentic Task Execution
 *
 * This endpoint runs the agentic loop and streams progress events
 * via Server-Sent Events (SSE) for real-time UI updates.
 *
 * Task data comes from request body (localStorage on client),
 * OAuth tokens come from Supabase.
 */

import { NextRequest } from 'next/server';
import { getHybridSession } from '@/lib/auth/getSession';
import { runAgenticLoop } from '@/lib/ai/anthropic';
import { supabaseAdmin, checkRateLimit } from '@/lib/supabase/server';
import { DEFAULT_AGENT_CONFIG } from '@/lib/ai/types';
import type { AgentProgressEvent, UserProfile } from '@/lib/ai/types';
import { getValidAccessToken } from '@/lib/google/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // Get session (supports both web NextAuth and mobile JWT)
  const session = await getHybridSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get task info from request body (since tasks are stored in localStorage)
  let taskTitle: string;
  let taskResearch: unknown = null;
  let customPrompt: string | null = null;
  try {
    const body = await request.json();
    taskTitle = body.taskTitle;
    taskResearch = body.taskResearch;
    customPrompt = body.customPrompt || null; // For insight-driven tasks
  } catch {
    return new Response(JSON.stringify({ error: 'Task title required in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!taskTitle) {
    return new Response(JSON.stringify({ error: 'Task title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profileId = session.user.id;
  let accessToken: string | undefined;

  // Build user profile from session
  // Note: location/timezone not yet in DB - agent will ask if needed
  const userProfile: UserProfile = {
    name: session.user.name || undefined,
    email: session.user.email || undefined,
    timezone: undefined, // TODO: Add timezone column to profiles
    location: undefined, // TODO: Add location column to profiles - agent will ask
  };

  // SECURITY: Rate limit agent executions (3/min, 20/hour, 50/day - expensive operation)
  const rateLimit = await checkRateLimit(profileId, 'agent_run', {
    perMinute: 3,
    perHour: 20,
    perDay: 50,
  });

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        limitType: rateLimit.limitType,
        resetAt: rateLimit.resetAt?.toISOString(),
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Get a valid access token (automatically refreshes if expired)
  const validToken = await getValidAccessToken(profileId);

  if (validToken) {
    accessToken = validToken;
    console.log('Access token loaded successfully (refreshed if needed)');
  } else {
    console.log('No valid access token available - user needs to re-authenticate');
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to emit SSE events
      const emit = async (event: AgentProgressEvent) => {
        // Send via SSE (immediate, for initiating device)
        const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      };

      try {
        // Run the agentic loop
        // Note: runAgenticLoop emits 'complete' event internally via onProgress
        await runAgenticLoop({
          userId: profileId,
          taskId,
          taskTitle,
          taskResearch,
          customPrompt,
          accessToken,
          config: DEFAULT_AGENT_CONFIG,
          userProfile,
          onProgress: emit,
          abortController,
          steps: [],
          totalTokens: 0,
        });
        // No need to emit complete here - runAgenticLoop already does it
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Emit error
        await emit({
          type: 'error',
          error: errorMessage,
          recoverable: false,
          timestamp: Date.now(),
        });
      } finally {
        controller.close();
      }
    },

    cancel() {
      // User closed connection - trigger cancellation
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
