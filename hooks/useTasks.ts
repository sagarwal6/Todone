'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, TaskStatus, TaskSource, Research, Feedback, AgentQuickInfo, AgentStepSummary } from '@/lib/types';
import * as taskOps from '@/lib/tasks';
import { saveTasks } from '@/lib/storage';

export type SyncError = {
  type: 'network' | 'auth' | 'server';
  message: string;
  taskId?: string;
  dismissedAt?: number;
};

// Fetch tasks from Supabase
async function fetchTasksFromSupabase(): Promise<{ tasks: Task[] | null; error: SyncError | null }> {
  try {
    const response = await fetch('/api/tasks');
    if (response.status === 401) {
      return { tasks: null, error: { type: 'auth', message: 'Please sign in to sync tasks' } };
    }
    if (!response.ok) {
      return { tasks: null, error: { type: 'server', message: 'Failed to load tasks from server' } };
    }
    const data = await response.json();
    return { tasks: data.tasks || [], error: null };
  } catch {
    return { tasks: null, error: { type: 'network', message: 'Unable to connect to server' } };
  }
}

// Sync a task to Supabase with error reporting
async function syncTaskToSupabase(
  task: Task,
  method: 'POST' | 'PUT' = 'POST'
): Promise<{ success: boolean; error?: SyncError }> {
  try {
    const url = method === 'POST' ? '/api/tasks' : `/api/tasks/${task.id}`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    if (response.status === 401) {
      return { success: false, error: { type: 'auth', message: 'Session expired', taskId: task.id } };
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Failed to sync task to Supabase (${method}):`, errData);
      return { success: false, error: { type: 'server', message: 'Failed to save task', taskId: task.id } };
    }
    return { success: true };
  } catch {
    return { success: false, error: { type: 'network', message: 'Unable to save task', taskId: task.id } };
  }
}

// Delete a task from Supabase (hard delete)
async function deleteTaskFromSupabase(taskId: string): Promise<{ success: boolean; error?: SyncError }> {
  try {
    const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (response.status === 401) {
      return { success: false, error: { type: 'auth', message: 'Session expired', taskId } };
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Failed to delete task from Supabase:', errData);
      return { success: false, error: { type: 'server', message: 'Failed to delete task', taskId } };
    }
    return { success: true };
  } catch {
    return { success: false, error: { type: 'network', message: 'Unable to delete task', taskId } };
  }
}

// Merge Supabase tasks with localStorage tasks (Supabase wins for conflicts)
// For cross-device sync: Supabase is source of truth, localStorage is just cache.
// Exception: chatMessages are merged by union (local messages may not have synced yet).
// Local-only tasks (not yet POSTed to Supabase) are preserved to avoid disappearing tasks.
function mergeTasks(supabaseTasks: Task[], localTasks: Task[]): Task[] {
  const localMap = new Map(localTasks.map(t => [t.id, t]));
  const supabaseIds = new Set(supabaseTasks.map(t => t.id));

  const merged = supabaseTasks.map(st => {
    const local = localMap.get(st.id);
    if (local) {
      const supabaseMessages = st.chatMessages || [];
      const localMessages = local.chatMessages || [];

      // If local has messages that Supabase doesn't, merge them in
      if (localMessages.length > supabaseMessages.length) {
        const supabaseMsgIds = new Set(supabaseMessages.map(m => m.id));
        const unsynced = localMessages.filter(m => !supabaseMsgIds.has(m.id));
        if (unsynced.length > 0) {
          const mergedMessages = [...supabaseMessages, ...unsynced]
            .sort((a, b) => a.timestamp - b.timestamp);
          return { ...st, chatMessages: mergedMessages };
        }
      }
    }
    return st;
  });

  // Preserve local-only tasks that haven't been POSTed to Supabase yet.
  // Without this, a task created moments ago would vanish on the next refetch.
  const localOnly = localTasks.filter(t => !supabaseIds.has(t.id));
  merged.push(...localOnly);

  return merged.sort((a, b) => a.order - b.order);
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<SyncError | null>(null);

  // Track tasks that have been synced to avoid duplicate POSTs
  const syncedTaskIds = useRef<Set<string>>(new Set());
  // Track if initial fetch from Supabase has been attempted
  const initialFetchDone = useRef(false);
  // Store previous state for rollback
  const previousTasksRef = useRef<Task[]>([]);

  // Dismiss sync error
  const dismissSyncError = useCallback(() => {
    setSyncError(prev => prev ? { ...prev, dismissedAt: Date.now() } : null);
  }, []);

  // Fetch from Supabase and merge with localStorage
  const loadTasks = useCallback(async (isRefetch = false) => {
    if (isRefetch) {
      setIsSyncing(true);
    }

    // First, load from localStorage for instant display
    const localTasks = taskOps.getAllTasks();
    if (!initialFetchDone.current) {
      setTasks(localTasks);
    }

    // Then fetch from Supabase
    const { tasks: supabaseTasks, error } = await fetchTasksFromSupabase();

    if (error) {
      // If auth error on initial load, just use localStorage
      if (error.type === 'auth' && !initialFetchDone.current) {
        setIsLoading(false);
        initialFetchDone.current = true;
        setIsSyncing(false);
        return;
      }
      // For other errors, show error but keep current tasks
      setSyncError(error);
      setIsLoading(false);
      setIsSyncing(false);
      return;
    }

    if (supabaseTasks) {
      // Supabase is source of truth
      const mergedTasks = mergeTasks(supabaseTasks, localTasks);

      // Update React state
      setTasks(mergedTasks);

      // Update localStorage to match merged state
      saveTasks(mergedTasks);

      // Mark all Supabase tasks as synced
      supabaseTasks.forEach(t => syncedTaskIds.current.add(t.id));
    }

    setIsLoading(false);
    setIsSyncing(false);
    initialFetchDone.current = true;
  }, []);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Refetch on window focus for cross-device sync
  useEffect(() => {
    const handleFocus = () => {
      // Only refetch if initial load is done and not currently syncing
      if (initialFetchDone.current && !isSyncing) {
        loadTasks(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTasks, isSyncing]);

  // Refresh tasks from Supabase (triggers cross-device sync)
  const refreshTasks = useCallback(() => {
    loadTasks(true);
  }, [loadTasks]);

  // Create a new task with optimistic update + Supabase sync
  const addTask = useCallback((title: string, customPrompt?: string | null, source?: TaskSource, sourceRef?: string | null): Task => {
    const newTask = taskOps.createTask(title, customPrompt, source, sourceRef);
    setTasks(prev => [...prev, newTask].sort((a, b) => a.order - b.order));

    // Sync to Supabase with error reporting
    syncTaskToSupabase(newTask, 'POST').then(result => {
      if (result.success) {
        syncedTaskIds.current.add(newTask.id);
      } else if (result.error) {
        setSyncError(result.error);
      }
    });

    return newTask;
  }, []);

  // Update task status + Supabase sync
  const updateStatus = useCallback((taskId: string, status: TaskStatus): void => {
    const now = Date.now();
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status, updatedAt: now, completedAt: status === 'completed' ? now : null }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setTaskStatus(taskId, status);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Set task research + Supabase sync
  const setResearch = useCallback((taskId: string, research: Research): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, research, status: 'ready' as TaskStatus, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setTaskResearch(taskId, research);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Mark task as personal (no research needed) + Supabase sync
  const markAsPersonal = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'personal' as TaskStatus, research: null, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setTaskAsPersonal(taskId);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Set task feedback + Supabase sync
  const setFeedback = useCallback((taskId: string, feedback: Feedback): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, feedback, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setTaskFeedback(taskId, feedback);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Mark task as researching
  const startResearching = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'researching' as TaskStatus, updatedAt: Date.now() }
        : t
    ));

    taskOps.markTaskResearching(taskId);
  }, []);

  // Complete a task
  const completeTask = useCallback((taskId: string): void => {
    updateStatus(taskId, 'completed');
  }, [updateStatus]);

  // Move task to someday
  const somedayTask = useCallback((taskId: string): void => {
    updateStatus(taskId, 'someday');
  }, [updateStatus]);

  // Restore a task
  const restoreTask = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'ready' as TaskStatus, completedAt: null, updatedAt: Date.now() }
        : t
    ));

    taskOps.restoreTask(taskId);
  }, []);

  // Delete a task + Supabase sync (hard delete)
  const deleteTask = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));

    taskOps.removeTask(taskId);

    // Hard delete from Supabase
    deleteTaskFromSupabase(taskId).then(result => {
      if (result.error) setSyncError(result.error);
    });
  }, []);

  // Update task title + Supabase sync
  const updateTitle = useCallback((taskId: string, title: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, title: title.trim(), updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.updateTaskTitle(taskId, title);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Reorder tasks (for drag and drop)
  const reorderTasks = useCallback((taskIds: string[]): void => {
    // Optimistic update
    setTasks(prev => {
      const taskMap = new Map(prev.map(t => [t.id, t]));
      return taskIds
        .map((id, index) => {
          const task = taskMap.get(id);
          return task ? { ...task, order: index } : null;
        })
        .filter((t): t is Task => t !== null);
    });

    taskOps.reorderTaskList(taskIds);
  }, []);

  // Toggle a step completion for a task
  const toggleStep = useCallback((taskId: string, stepLabel: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      const completedSteps = t.completedSteps || [];
      const isCompleted = completedSteps.includes(stepLabel);
      const newCompletedSteps = isCompleted
        ? completedSteps.filter(s => s !== stepLabel)
        : [...completedSteps, stepLabel];

      return { ...t, completedSteps: newCompletedSteps, updatedAt: Date.now() };
    }));

    taskOps.toggleTaskStep(taskId, stepLabel);
  }, []);

  // Toggle pin status for a task + Supabase sync
  const togglePin = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, isPinned: !t.isPinned, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.togglePinTask(taskId);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Add a chat message to a task (with deduplication)
  const addChatMessage = useCallback((taskId: string, message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number }): void => {
    // Optimistic update with deduplication check
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;

      // Check for duplicate by ID
      const existingMessages = t.chatMessages || [];
      if (existingMessages.some(m => m.id === message.id)) {
        // Message already exists, don't add duplicate
        return t;
      }

      return { ...t, chatMessages: [...existingMessages, message], updatedAt: Date.now() };
    }));

    // Update localStorage and sync ONLY chatMessages to Supabase.
    // Sending the full task would overwrite agent-set fields (status, etc.)
    // and is slower — this targeted PUT is faster so the running agent loop
    // picks up mid-run messages before it finalizes.
    const task = taskOps.addChatMessage(taskId, message);
    if (task) {
      fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatMessages: task.chatMessages }),
      }).then(response => {
        if (!response.ok) {
          setSyncError({ type: 'server', message: 'Failed to save message', taskId });
        }
      }).catch(() => {
        setSyncError({ type: 'network', message: 'Unable to save message', taskId });
      });
    }
  }, []);

  // Set agent quick info for a task + Supabase sync
  const setAgentQuickInfo = useCallback((taskId: string, agentQuickInfo: AgentQuickInfo): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, agentQuickInfo, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setAgentQuickInfo(taskId, agentQuickInfo);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Set agent steps for a task (persisted for display) + Supabase sync
  const setAgentSteps = useCallback((taskId: string, agentSteps: AgentStepSummary[]): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, agentSteps, updatedAt: Date.now() }
        : t
    ));

    // Update localStorage and sync to Supabase
    const task = taskOps.setAgentSteps(taskId, agentSteps);
    if (task) {
      syncTaskToSupabase(task, 'PUT').then(result => {
        if (result.error) setSyncError(result.error);
      });
    }
  }, []);

  // Filter helpers - exclude insight-sourced tasks from visible lists
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'someday' && t.source !== 'insight');
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.source !== 'insight');
  const somedayTasks = tasks.filter(t => t.status === 'someday' && t.source !== 'insight');
  const pinnedTasks = activeTasks.filter(t => t.isPinned);
  const unpinnedTasks = activeTasks.filter(t => !t.isPinned);
  // Insight tasks are hidden from main lists but accessible for result tracking
  const insightTasks = tasks.filter(t => t.source === 'insight');

  return {
    tasks,
    activeTasks,
    completedTasks,
    somedayTasks,
    pinnedTasks,
    unpinnedTasks,
    insightTasks,
    isLoading,
    isSyncing,
    syncError,
    dismissSyncError,
    addTask,
    updateStatus,
    setResearch,
    markAsPersonal,
    setFeedback,
    startResearching,
    completeTask,
    somedayTask,
    restoreTask,
    deleteTask,
    updateTitle,
    reorderTasks,
    refreshTasks,
    toggleStep,
    togglePin,
    addChatMessage,
    setAgentQuickInfo,
    setAgentSteps,
  };
}
