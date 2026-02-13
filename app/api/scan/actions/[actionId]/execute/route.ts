/**
 * Execute Insight Action API Route
 *
 * Takes a suggested action from the insight scan and executes it
 * by creating a task and running the agentic loop.
 */

import { NextRequest } from 'next/server';
import { getHybridSession } from '@/lib/auth/getSession';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getActionExecutionPrompt } from '@/lib/scan/prompts';
import type { InsightAction } from '@/lib/scan/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const { actionId } = await params;

  // Parse request body for optional user input, replyMode, and addToTasksOnly flag
  let userInput: string | undefined;
  let replyMode: 'draft' | 'write' | undefined;
  let addToTasksOnly = false;
  try {
    const body = await request.json();
    userInput = body.userInput;
    replyMode = body.replyMode;
    addToTasksOnly = body.addToTasksOnly === true;
  } catch {
    // No body or invalid JSON is fine - userInput is optional
  }

  // Get session (supports both web NextAuth and mobile JWT)
  const session = await getHybridSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profile = { id: session.user.id };

  // Get the action
  const { data: action, error: actionError } = await supabaseAdmin
    .from('insight_actions')
    .select(`
      id,
      type,
      priority,
      headline,
      detail,
      execution_context,
      status,
      scan_id,
      insight_scans!inner (
        user_id
      )
    `)
    .eq('id', actionId)
    .single();

  if (actionError || !action) {
    return new Response(JSON.stringify({ error: 'Action not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify ownership - insight_scans is an object from inner join
  const scanData = action.insight_scans as unknown as { user_id: string };
  if (scanData.user_id !== profile.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if already completed (but allow retry of in_progress)
  if (action.status === 'completed') {
    return new Response(JSON.stringify({
      error: 'Action already completed',
      status: action.status,
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build the action object for prompt generation
  const insightAction: InsightAction = {
    id: action.id,
    type: action.type,
    priority: action.priority,
    headline: action.headline,
    detail: action.detail || '',
    context: action.execution_context,
  };

  // Generate task title based on action type
  const taskTitle = generateTaskTitle(insightAction);

  // Create a task ID that the client can use to track progress
  const taskId = uuidv4();

  // If addToTasksOnly, mark the action as "graduated" and return task info
  // without starting the agent loop
  if (addToTasksOnly) {
    // Mark action as graduated (a special completed state)
    await supabaseAdmin
      .from('insight_actions')
      .update({ status: 'completed', result: { graduatedToTask: taskId } })
      .eq('id', actionId);

    // Return task info for the client to create a local task
    return new Response(JSON.stringify({
      success: true,
      taskId,
      taskTitle,
      actionId,
      addedToTasks: true,
      // Include source metadata for the task
      sourceMetadata: {
        type: action.type,
        ...action.execution_context,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mark action as in progress (executing)
  await supabaseAdmin
    .from('insight_actions')
    .update({ status: 'in_progress' })
    .eq('id', actionId);

  // Return the task info - client will initiate the agent run
  return new Response(JSON.stringify({
    success: true,
    taskId,
    taskTitle,
    actionId,
    prompt: getActionExecutionPrompt(insightAction, userInput, replyMode),
    replyMode, // Pass mode so client knows how to handle
    context: action.execution_context,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Generate a user-friendly task title based on action type
 */
function generateTaskTitle(action: InsightAction): string {
  try {
    switch (action.type) {
      case 'draft_response': {
        const ctx = action.context as { senderName?: string; subject?: string };
        if (ctx.senderName && ctx.subject) {
          return `Reply to ${ctx.senderName}: "${ctx.subject.slice(0, 40)}${ctx.subject.length > 40 ? '...' : ''}"`;
        }
        break;
      }
      case 'meeting_prep': {
        const ctx = action.context as { title?: string };
        if (ctx.title) {
          return `Prepare for: ${ctx.title}`;
        }
        break;
      }
      case 'follow_up': {
        const ctx = action.context as { recipients?: string[]; subject?: string };
        if (ctx.recipients?.[0] && ctx.subject) {
          return `Follow up with ${ctx.recipients[0]} about "${ctx.subject.slice(0, 30)}..."`;
        }
        break;
      }
      case 'smart_label': {
        const ctx = action.context as { senderName?: string };
        if (ctx.senderName) {
          return `Organize emails from ${ctx.senderName}`;
        }
        break;
      }
    }
  } catch {
    // Fall through to headline
  }
  return action.headline;
}

/**
 * PATCH endpoint to update action status (dismiss, complete, fail)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const { actionId } = await params;

  // Get session (supports both web NextAuth and mobile JWT)
  const session = await getHybridSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const profile = { id: session.user.id };

  // Parse request body
  const body = await request.json();
  const { status, result } = body;

  // Validate status
  const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'dismissed'];
  if (!validStatuses.includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify ownership via scan
  const { data: action } = await supabaseAdmin
    .from('insight_actions')
    .select(`
      id,
      scan_id,
      insight_scans!inner (
        user_id
      )
    `)
    .eq('id', actionId)
    .single();

  if (!action) {
    return new Response(JSON.stringify({ error: 'Action not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const patchScanData = action.insight_scans as unknown as { user_id: string };
  if (patchScanData.user_id !== profile.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update action
  const { error: updateError } = await supabaseAdmin
    .from('insight_actions')
    .update({
      status,
      result: result || null,
    })
    .eq('id', actionId);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update action' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, status }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
