'use client';

/**
 * useInsightScan Hook
 *
 * Manages the insight scan lifecycle:
 * - Initiates scan via SSE
 * - Handles cached results
 * - Tracks streaming progress
 * - Supports cancellation
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ScanState,
  ScanProgressEvent,
  InsightPortrait,
  InsightAction,
  ActionBundle,
  CachedScanResponse,
  InsightScan,
  BundledAnalysisResult,
  DraftResponseContext,
} from '@/lib/scan/types';

import type { AgentQuickInfo, ChatMessage } from '@/lib/types';

// Email content cache
export interface EmailContent {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

// Pending draft from agent execution
export interface PendingDraft {
  type: 'email' | 'calendar';
  content: string;
  // For email drafts
  to?: string;
  subject?: string;
  threadId?: string;
  // For calendar events
  eventDetails?: {
    title: string;
    start: string;
    end: string;
    attendees?: string[];
  };
}

// Local action state for tracking status and results
export interface LocalActionState {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: {
    message?: string;
    quickInfo?: AgentQuickInfo;
    pendingDrafts?: PendingDraft[];
    chatMessages?: ChatMessage[];
    error?: string;
  };
  taskId?: string;
  /** Timestamp when action entered in_progress — used for stale timeout */
  startedAt?: number;
}

// Extended state with email cache and action states
interface ExtendedScanState extends ScanState {
  emailCache: Record<string, EmailContent>;
  actionStates: Record<string, LocalActionState>;
}

/**
 * Sync action status and result to Supabase via PATCH API
 * This ensures cross-device sync for action states
 */
async function syncActionStateToDatabase(
  actionId: string,
  status: LocalActionState['status'],
  result?: LocalActionState['result']
): Promise<boolean> {
  try {
    const response = await fetch(`/api/scan/actions/${actionId}/execute`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, result }),
    });
    return response.ok;
  } catch (e) {
    console.error('Failed to sync action state to database:', e);
    return false;
  }
}

/**
 * Extract action states from loaded actions (from database)
 * This populates local state from the database on initial load
 */
function extractActionStatesFromActions(
  actions: InsightAction[],
  quickWin: InsightAction | null | undefined,
  bundles: ActionBundle[] | undefined
): Record<string, LocalActionState> {
  const states: Record<string, LocalActionState> = {};

  const processAction = (action: InsightAction & { status?: string; result?: LocalActionState['result'] }) => {
    // Only track non-pending statuses (pending is default)
    if (action.status && action.status !== 'pending') {
      states[action.id] = {
        status: action.status as LocalActionState['status'],
        result: action.result,
      };
    }
  };

  // Process legacy actions array
  actions.forEach(processAction);

  // Process quickWin
  if (quickWin) {
    processAction(quickWin as InsightAction & { status?: string; result?: LocalActionState['result'] });
  }

  // Process bundled items
  bundles?.forEach(bundle => {
    bundle.items.forEach(item => {
      processAction(item as InsightAction & { status?: string; result?: LocalActionState['result'] });
    });
  });

  return states;
}

const initialState: ExtendedScanState = {
  phase: 'idle',
  portrait: null,
  actions: [],
  error: null,
  scanId: null,
  emailsScanned: 0,
  eventsScanned: 0,
  // New bundled format
  greeting: null,
  quickWin: null,
  bundles: [],
  // Email content cache
  emailCache: {},
  // Action states for tracking status and results (synced to Supabase)
  actionStates: {},
};

export function useInsightScan() {
  const [state, setState] = useState<ExtendedScanState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Pre-fetch email content for all draft_response actions
   */
  const prefetchEmails = useCallback(async (actions: InsightAction[]) => {
    const draftActions = actions.filter(a => a.type === 'draft_response');
    if (draftActions.length === 0) return;

    // Fetch all emails in parallel
    const fetches = draftActions.map(async (action) => {
      const ctx = action.context as DraftResponseContext;
      if (!ctx?.messageId) return null;

      try {
        const response = await fetch(`/api/scan/email/${ctx.messageId}`);
        if (!response.ok) return null;
        const data = await response.json();
        return { messageId: ctx.messageId, email: data.email as EmailContent };
      } catch {
        return null;
      }
    });

    const results = await Promise.all(fetches);

    // Update cache with fetched emails
    const newCache: Record<string, EmailContent> = {};
    for (const result of results) {
      if (result) {
        newCache[result.messageId] = result.email;
      }
    }

    if (Object.keys(newCache).length > 0) {
      setState(prev => ({
        ...prev,
        emailCache: { ...prev.emailCache, ...newCache },
      }));
    }
  }, []);

  // Trigger email prefetch when SSE scan completes (not cached)
  const hasPrefetchedRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'complete' && !hasPrefetchedRef.current) {
      hasPrefetchedRef.current = true;
      const allActions = [
        ...(state.quickWin ? [state.quickWin] : []),
        ...(state.bundles?.flatMap(b => b.items) || []),
      ];
      if (allActions.length > 0) {
        prefetchEmails(allActions);
      }
    } else if (state.phase !== 'complete') {
      hasPrefetchedRef.current = false;
    }
  }, [state.phase, state.quickWin, state.bundles, prefetchEmails]);

  /**
   * Start a new scan or retrieve cached results
   * @param force - If true, bypass cache and do a fresh scan
   * @param options - Optional scan options including protected senders
   */
  const startScan = useCallback(async (force: boolean = false, options?: { protectedSenders?: string[] }) => {
    // Cancel any existing scan
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState({
      ...initialState,
      phase: 'scanning',
    });

    try {
      const url = force ? '/api/scan?force=true' : '/api/scan';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protectedSenders: options?.protectedSenders || [],
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Scan failed');
      }

      // Check if response is cached JSON or SSE stream
      const contentType = response.headers.get('Content-Type');

      if (contentType?.includes('application/json')) {
        // Cached response - includes status/result from database
        const data = await response.json() as CachedScanResponse & {
          scan: InsightScan & {
            greeting?: string;
            quickWin?: InsightAction;
            bundles?: ActionBundle[];
          };
        };

        // Extract action states from database (actions come with status/result)
        const actionStates = extractActionStatesFromActions(
          data.scan.actions,
          data.scan.quickWin,
          data.scan.bundles
        );

        setState(prev => ({
          ...prev,
          phase: 'complete',
          portrait: data.scan.portrait,
          actions: data.scan.actions,
          error: null,
          scanId: data.scan.id,
          emailsScanned: data.scan.contextSummary.emailsScanned,
          eventsScanned: data.scan.contextSummary.eventsScanned,
          // New bundled format
          greeting: data.scan.greeting || null,
          quickWin: data.scan.quickWin || null,
          bundles: data.scan.bundles || [],
          // Populate action states from database
          actionStates,
        }));

        // Pre-fetch email content for draft actions
        const allActions = [
          ...(data.scan.quickWin ? [data.scan.quickWin] : []),
          ...(data.scan.bundles?.flatMap(b => b.items) || []),
        ];
        prefetchEmails(allActions);
        return;
      }

      // SSE stream
      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data) as ScanProgressEvent;
              handleEvent(event, setState);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState(prev => ({
          ...prev,
          phase: 'idle',
        }));
      } else {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setState(prev => ({
          ...prev,
          phase: 'error',
          error: errorMessage,
        }));
      }
    }
  }, []);

  /**
   * Cancel an in-progress scan
   */
  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({
      ...prev,
      phase: 'idle',
    }));
  }, []);

  /**
   * Reset state to idle
   */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  /**
   * Execute an action from the scan results
   * @param userInput - Optional user instructions for the action (e.g., what to say in a draft)
   * @param replyMode - 'draft' (AI drafts for you) or 'write' (user wrote it, just save)
   *
   * Changed behavior: Instead of removing the action, we now track its status locally.
   * This allows the panel to stay open and show results inline.
   */
  const executeAction = useCallback(async (actionId: string, userInput?: string, replyMode?: 'draft' | 'write'): Promise<{
    success: boolean;
    taskId?: string;
    taskTitle?: string;
    customPrompt?: string;
    error?: string;
  }> => {
    // Set status to in_progress immediately (don't remove)
    setState(prev => ({
      ...prev,
      actionStates: {
        ...prev.actionStates,
        [actionId]: {
          status: 'in_progress',
          startedAt: Date.now(),
        },
      },
    }));

    try {
      const response = await fetch(`/api/scan/actions/${actionId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, replyMode }),
      });

      if (!response.ok) {
        const error = await response.json();
        // Set status to failed
        setState(prev => ({
          ...prev,
          actionStates: {
            ...prev.actionStates,
            [actionId]: {
              status: 'failed',
              result: { error: error.error },
            },
          },
        }));
        return { success: false, error: error.error };
      }

      const data = await response.json();

      // Store the taskId for result tracking - status will be updated when agent completes
      setState(prev => ({
        ...prev,
        actionStates: {
          ...prev.actionStates,
          [actionId]: {
            ...prev.actionStates[actionId],
            taskId: data.taskId,
          },
        },
      }));

      return {
        success: true,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        customPrompt: data.prompt, // The prompt generated for this action
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to execute action';
      // Set status to failed
      setState(prev => ({
        ...prev,
        actionStates: {
          ...prev.actionStates,
          [actionId]: {
            status: 'failed',
            result: { error: errorMessage },
          },
        },
      }));
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, []);

  /**
   * Dismiss an action
   */
  const dismissAction = useCallback(async (actionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/scan/actions/${actionId}/execute`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });

      if (response.ok) {
        // Remove from local state (both legacy and bundled)
        setState(prev => ({
          ...prev,
          actions: prev.actions.filter(a => a.id !== actionId),
          // Clear quickWin if dismissed
          quickWin: prev.quickWin?.id === actionId ? null : prev.quickWin,
          // Remove from bundles
          bundles: prev.bundles.map(bundle => ({
            ...bundle,
            items: bundle.items.filter(item => item.id !== actionId),
          })).filter(bundle => bundle.items.length > 0), // Remove empty bundles
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Add an action to the user's task list (without executing)
   * This "graduates" a Heads up item to a proper task for later
   */
  const addToTasks = useCallback(async (actionId: string): Promise<{
    success: boolean;
    taskId?: string;
    error?: string;
  }> => {
    try {
      const response = await fetch(`/api/scan/actions/${actionId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addToTasksOnly: true }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error };
      }

      const data = await response.json();

      // Remove action from local state (it's now a task)
      setState(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a.id !== actionId),
        quickWin: prev.quickWin?.id === actionId ? null : prev.quickWin,
        bundles: prev.bundles.map(bundle => ({
          ...bundle,
          items: bundle.items.filter(item => item.id !== actionId),
        })).filter(bundle => bundle.items.length > 0),
      }));

      return {
        success: true,
        taskId: data.taskId,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to add to tasks',
      };
    }
  }, []);

  /**
   * Get cached email content by messageId
   */
  const getEmailContent = useCallback((messageId: string): EmailContent | null => {
    return state.emailCache[messageId] || null;
  }, [state.emailCache]);

  /**
   * Reconcile action states with completed insight tasks
   * Call this on mount to catch any tasks that completed while user was away
   * Syncs any found completions to Supabase
   *
   * @param insightTasks - Tasks with source='insight'
   * @param getAgentState - Function to get agent state by taskId
   */
  const reconcileWithTasks = useCallback((
    insightTasks: Array<{ id: string; agentQuickInfo?: AgentQuickInfo; chatMessages?: Array<{ role: string; content: string }> }>,
    getAgentState: (taskId: string) => { isRunning: boolean; result?: unknown; error?: string | null } | null
  ): void => {
    // Check each in_progress action
    for (const [actionId, actionState] of Object.entries(state.actionStates)) {
      if (actionState.status !== 'in_progress' || !actionState.taskId) continue;

      // Check if agent has completed
      const agentState = getAgentState(actionState.taskId);
      if (agentState && !agentState.isRunning && agentState.result) {
        // Cast result to expected type
        const agentResult = agentState.result as { status: string; message?: string; quickInfo?: AgentQuickInfo };
        if (agentResult.status === 'completed') {
          const completedResult = {
            message: agentResult.message,
            quickInfo: agentResult.quickInfo,
          };
          setState(prev => ({
            ...prev,
            actionStates: {
              ...prev.actionStates,
              [actionId]: {
                ...prev.actionStates[actionId],
                status: 'completed',
                result: completedResult,
              },
            },
          }));
          // Sync to database
          syncActionStateToDatabase(actionId, 'completed', completedResult);
        } else if (agentState.error) {
          const failedResult = { error: agentState.error || 'Unknown error' };
          setState(prev => ({
            ...prev,
            actionStates: {
              ...prev.actionStates,
              [actionId]: {
                ...prev.actionStates[actionId],
                status: 'failed',
                result: failedResult,
              },
            },
          }));
          // Sync to database
          syncActionStateToDatabase(actionId, 'failed', failedResult);
        }
        continue;
      }

      // Check if task has results (agent completed while user was away)
      const task = insightTasks.find(t => t.id === actionState.taskId);
      if (task) {
        // Check if task has agent results (quickInfo or chat messages)
        const hasResults = task.agentQuickInfo || task.chatMessages?.some(m => m.role === 'assistant');
        if (hasResults) {
          // Get the last assistant message as the result message
          const lastAssistantMessage = task.chatMessages?.filter(m => m.role === 'assistant').pop();
          const taskResult = {
            message: lastAssistantMessage?.content,
            quickInfo: task.agentQuickInfo,
          };
          setState(prev => ({
            ...prev,
            actionStates: {
              ...prev.actionStates,
              [actionId]: {
                ...prev.actionStates[actionId],
                status: 'completed',
                result: taskResult,
              },
            },
          }));
          // Sync to database
          syncActionStateToDatabase(actionId, 'completed', taskResult);
        }
      }
    }
  }, [state.actionStates]);

  /**
   * Get local action state by actionId
   */
  const getActionState = useCallback((actionId: string): LocalActionState | null => {
    return state.actionStates[actionId] || null;
  }, [state.actionStates]);

  /**
   * Set action result when agent completes
   * Called by InsightView when AgentContext reports completion
   * Syncs to Supabase for cross-device persistence
   */
  const setActionResult = useCallback((actionId: string, result: LocalActionState['result']): void => {
    // Update local state immediately (optimistic)
    setState(prev => ({
      ...prev,
      actionStates: {
        ...prev.actionStates,
        [actionId]: {
          ...prev.actionStates[actionId],
          status: 'completed',
          result,
        },
      },
    }));

    // Sync to database in background
    syncActionStateToDatabase(actionId, 'completed', result);
  }, []);

  /**
   * Mark action as failed with error
   * Syncs to Supabase for cross-device persistence
   */
  const setActionFailed = useCallback((actionId: string, error: string): void => {
    const result = { error };

    // Update local state immediately (optimistic)
    setState(prev => ({
      ...prev,
      actionStates: {
        ...prev.actionStates,
        [actionId]: {
          ...prev.actionStates[actionId],
          status: 'failed',
          result,
        },
      },
    }));

    // Sync to database in background
    syncActionStateToDatabase(actionId, 'failed', result);
  }, []);

  /**
   * Update chat messages for an action (follow-up chat in insight detail panel)
   * Persists to local state and syncs to Supabase
   */
  const updateActionChatMessages = useCallback((actionId: string, chatMessages: ChatMessage[]): void => {
    setState(prev => {
      const existing = prev.actionStates[actionId];
      if (!existing) return prev;

      const updatedResult = {
        ...existing.result,
        chatMessages,
      };

      // Sync to database in background
      syncActionStateToDatabase(actionId, existing.status, updatedResult);

      return {
        ...prev,
        actionStates: {
          ...prev.actionStates,
          [actionId]: {
            ...existing,
            result: updatedResult,
          },
        },
      };
    });
  }, []);

  /**
   * Get the taskId associated with an action (for result tracking)
   */
  const getActionTaskId = useCallback((actionId: string): string | undefined => {
    return state.actionStates[actionId]?.taskId;
  }, [state.actionStates]);

  // Time out stale in_progress actions (3 minutes)
  useEffect(() => {
    const STALE_TIMEOUT_MS = 3 * 60 * 1000;
    const interval = setInterval(() => {
      const now = Date.now();
      let hasStale = false;

      for (const [, actionState] of Object.entries(state.actionStates)) {
        if (
          actionState.status === 'in_progress' &&
          (!actionState.startedAt || now - actionState.startedAt > STALE_TIMEOUT_MS)
        ) {
          hasStale = true;
          break;
        }
      }

      if (hasStale) {
        setState(prev => {
          const updated = { ...prev.actionStates };
          for (const [actionId, actionState] of Object.entries(updated)) {
            if (
              actionState.status === 'in_progress' &&
              (!actionState.startedAt || now - actionState.startedAt > STALE_TIMEOUT_MS)
            ) {
              updated[actionId] = {
                ...actionState,
                status: 'failed',
                result: { error: 'Timed out' },
              };
            }
          }
          return { ...prev, actionStates: updated };
        });
      }
    }, 15_000); // Check every 15 seconds

    return () => clearInterval(interval);
  }, [state.actionStates]);

  return {
    ...state,
    startScan,
    cancelScan,
    reset,
    executeAction,
    dismissAction,
    addToTasks,
    getEmailContent,
    getActionState,
    setActionResult,
    setActionFailed,
    getActionTaskId,
    updateActionChatMessages,
    reconcileWithTasks,
  };
}

/**
 * Handle individual SSE events
 */
function handleEvent(
  event: ScanProgressEvent,
  setState: React.Dispatch<React.SetStateAction<ExtendedScanState>>
) {
  switch (event.type) {
    case 'metadata_started':
      setState(prev => ({
        ...prev,
        phase: 'scanning',
      }));
      break;

    case 'metadata_progress':
      setState(prev => ({
        ...prev,
        ...(event.source === 'gmail'
          ? { emailsScanned: event.count }
          : { eventsScanned: event.count }),
      }));
      break;

    case 'metadata_complete':
      setState(prev => ({
        ...prev,
        emailsScanned: event.emailCount,
        eventsScanned: event.eventCount,
      }));
      break;

    case 'metadata_error':
      // Don't fail the whole scan, just log
      console.warn(`Metadata error (${event.source}):`, event.error);
      break;

    case 'analysis_started':
      setState(prev => ({
        ...prev,
        phase: 'analyzing',
      }));
      break;

    case 'portrait_ready':
      setState(prev => ({
        ...prev,
        portrait: event.portrait,
      }));
      break;

    case 'action_ready':
      setState(prev => ({
        ...prev,
        actions: [...prev.actions, event.action],
      }));
      break;

    case 'analysis_complete':
      // New bundled format
      setState(prev => ({
        ...prev,
        greeting: event.result.greeting,
        quickWin: event.result.quickWin,
        bundles: event.result.bundles,
      }));
      break;

    case 'complete':
      setState(prev => ({
        ...prev,
        phase: 'complete',
        scanId: event.scanId,
      }));
      break;

    case 'error':
      setState(prev => ({
        ...prev,
        phase: 'error',
        error: event.error,
      }));
      break;
  }
}

export default useInsightScan;
