/**
 * Task Sync Endpoint
 *
 * Creates or updates a task in Supabase from the client-side localStorage task.
 * This bridges the gap between localStorage tasks and the agentic loop.
 * Uses toSupabaseTask converter to sync ALL task fields.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toSupabaseTask, fromSupabaseTask } from '@/lib/types';
import type { Task } from '@/lib/types';

export async function POST(request: NextRequest) {
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

  // Parse task from request
  let taskData: Partial<Task>;
  try {
    taskData = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!taskData.id || !taskData.title) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: id, title' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Build full task with defaults
  const now = Date.now();
  const fullTask: Task = {
    id: taskData.id,
    title: taskData.title,
    status: taskData.status ?? 'pending',
    order: taskData.order ?? 0,
    research: taskData.research ?? null,
    feedback: taskData.feedback ?? null,
    createdAt: taskData.createdAt ?? now,
    updatedAt: taskData.updatedAt ?? now,
    completedAt: taskData.completedAt ?? null,
    isPinned: taskData.isPinned ?? false,
    chatMessages: taskData.chatMessages ?? [],
    agentQuickInfo: taskData.agentQuickInfo,
    agentSteps: taskData.agentSteps ?? [],
    customPrompt: taskData.customPrompt,
    source: taskData.source ?? 'user',
    completedSteps: taskData.completedSteps ?? [],
  };

  // Convert to Supabase format using converter (syncs ALL fields)
  const supabaseTask = toSupabaseTask(fullTask, userId);

  // Upsert task to Supabase
  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .upsert(supabaseTask, {
      onConflict: 'id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to sync task:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to sync task', details: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const task = fromSupabaseTask(row);
  return new Response(JSON.stringify({ success: true, task }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
