/**
 * Tasks API Endpoint
 *
 * GET  - List all tasks for authenticated user (excludes soft-deleted)
 * POST - Create a new task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toSupabaseTask, fromSupabaseTask } from '@/lib/types';
import type { Task } from '@/lib/types';

// Helper to get user profile from session
async function getUserProfile(email: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  return profile;
}

/**
 * GET /api/tasks
 * List all tasks for the authenticated user (excludes soft-deleted tasks)
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getUserProfile(session.user.email);
  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('user_id', profile.id)
    .is('deleted_at', null)
    .order('order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: error.message },
      { status: 500 }
    );
  }

  const tasks = rows.map(fromSupabaseTask);
  return NextResponse.json({ tasks });
}

/**
 * POST /api/tasks
 * Create a new task
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getUserProfile(session.user.email);
  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let taskData: Partial<Task>;
  try {
    taskData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!taskData.id || !taskData.title) {
    return NextResponse.json(
      { error: 'Missing required fields: id, title' },
      { status: 400 }
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

  const supabaseTask = toSupabaseTask(fullTask, profile.id);

  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .insert(supabaseTask)
    .select()
    .single();

  if (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', details: error.message },
      { status: 500 }
    );
  }

  const task = fromSupabaseTask(row);
  return NextResponse.json({ task }, { status: 201 });
}
