/**
 * Single Task API Endpoint
 *
 * GET    - Fetch a single task
 * PUT    - Update a task
 * DELETE - Soft delete a task (sets deleted_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHybridSession } from '@/lib/auth/getSession';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toSupabaseTask, fromSupabaseTask } from '@/lib/types';
import type { Task } from '@/lib/types';

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

/**
 * GET /api/tasks/[taskId]
 * Fetch a single task by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;

  const session = await getHybridSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const task = fromSupabaseTask(row);
  return NextResponse.json({ task });
}

/**
 * PUT /api/tasks/[taskId]
 * Update an existing task
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;

  const session = await getHybridSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let taskData: Partial<Task>;
  try {
    taskData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Fetch existing task to merge with updates
  const { data: existingRow, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existingRow) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Convert existing row to Task, then merge updates
  const existingTask = fromSupabaseTask(existingRow);
  const updatedTask: Task = {
    ...existingTask,
    ...taskData,
    id: taskId, // Ensure ID doesn't change
    updatedAt: Date.now(),
  };

  // Convert back to Supabase format for update
  const supabaseTask = toSupabaseTask(updatedTask, session.user.id);

  const { data: row, error } = await supabaseAdmin
    .from('tasks')
    .update(supabaseTask)
    .eq('id', taskId)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: error.message },
      { status: 500 }
    );
  }

  const task = fromSupabaseTask(row);
  return NextResponse.json({ task });
}

/**
 * DELETE /api/tasks/[taskId]
 * Hard delete a task (removes row from database)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { taskId } = await params;

  const session = await getHybridSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Hard delete - remove the row
  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', session.user.id);

  if (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
