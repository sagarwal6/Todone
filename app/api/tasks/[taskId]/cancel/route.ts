/**
 * Task Cancellation Endpoint
 *
 * Marks a task as cancelled, which will be detected by the
 * running agentic loop and cause it to gracefully terminate.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabaseAdmin, logAuditEvent } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // Get session
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get user from database
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = profile.id;

  // Parse request body for optional reason
  let reason = 'User cancelled';
  try {
    const body = await request.json();
    if (body.reason) {
      reason = body.reason;
    }
  } catch {
    // No body or invalid JSON - use default reason
  }

  // Get task and verify ownership
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, status, user_id')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (taskError || !task) {
    return new Response(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if task can be cancelled
  if (task.status === 'done') {
    return new Response(
      JSON.stringify({ error: 'Cannot cancel a completed task' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (task.status === 'failed') {
    return new Response(
      JSON.stringify({ error: 'Task has already failed' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Update task with cancellation
  const { error: updateError } = await supabaseAdmin
    .from('tasks')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      status: 'failed', // Mark as failed since it was cancelled
    })
    .eq('id', taskId);

  if (updateError) {
    console.error('Failed to cancel task:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to cancel task' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Log audit event (SECURITY: no user data, just the action)
  await logAuditEvent(
    userId,
    taskId,
    'task_cancelled',
    null, // Intentionally NOT logging reason to avoid storing user data
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined
  );

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Task cancellation requested',
      taskId,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
