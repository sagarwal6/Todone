'use client';

/**
 * useTaskProgress Hook
 *
 * Dual-channel progress tracking:
 * - SSE for the initiating device (immediate, low latency)
 * - Supabase Realtime for cross-device sync (persisted)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AgentProgressEvent, AgentResult } from '@/lib/ai/types';

interface UseTaskProgressOptions {
  taskId: string;
  taskTitle?: string;
  taskResearch?: unknown; // Research data for context
  isInitiator?: boolean; // True if this device started the task
  onComplete?: (result: AgentResult) => void;
  onError?: (error: string) => void;
}

interface TaskProgressState {
  isRunning: boolean;
  progress: AgentProgressEvent[];
  currentStep: string | null;
  result: AgentResult | null;
  error: string | null;
}

export function useTaskProgress({
  taskId,
  taskTitle,
  taskResearch,
  isInitiator = false,
  onComplete,
  onError,
}: UseTaskProgressOptions) {
  const [state, setState] = useState<TaskProgressState>({
    isRunning: false,
    progress: [],
    currentStep: null,
    result: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentTaskIdRef = useRef<string>(taskId);

  /**
   * Reset state and cancel any running task when taskId changes
   */
  useEffect(() => {
    // Cancel any running task for the previous taskId
    if (currentTaskIdRef.current !== taskId) {
      abortControllerRef.current?.abort();
      eventSourceRef.current?.close();
    }

    // Update the ref
    currentTaskIdRef.current = taskId;

    // Reset state for the new task
    setState({
      isRunning: false,
      progress: [],
      currentStep: null,
      result: null,
      error: null,
    });
  }, [taskId]);

  /**
   * Start the agentic task (initiator only)
   */
  const startTask = useCallback(async () => {
    if (!isInitiator) return;

    setState({
      isRunning: true,
      progress: [],
      currentStep: 'Starting agent...',
      result: null,
      error: null,
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    // Start the agentic loop - send task data in request body
    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskTitle: taskTitle || 'Task',
          taskResearch: taskResearch || null,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start task');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        // Stop if task changed
        if (currentTaskIdRef.current !== taskId) {
          reader.cancel();
          break;
        }

        if (done) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
          }));
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data) as AgentProgressEvent;

              setState((prev) => ({
                ...prev,
                progress: [...prev.progress, event],
                currentStep: getStepDescription(event),
              }));

              // Handle specific events
              if (event.type === 'complete') {
                setState((prev) => ({
                  ...prev,
                  isRunning: false,
                  result: event.result,
                }));
                onComplete?.(event.result);
              } else if (event.type === 'error') {
                setState((prev) => ({
                  ...prev,
                  isRunning: false,
                  error: event.error,
                }));
                onError?.(event.error);
              } else if (event.type === 'cancelled') {
                setState((prev) => ({
                  ...prev,
                  isRunning: false,
                  result: {
                    status: 'cancelled',
                    reason: event.reason,
                    completedSteps: event.completedSteps,
                    tokensUsed: 0,
                  },
                }));
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          result: {
            status: 'cancelled',
            reason: 'User cancelled',
            completedSteps: [],
            tokensUsed: 0,
          },
        }));
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: errorMessage,
        }));
        onError?.(errorMessage);
      }
    }
  }, [taskId, taskTitle, taskResearch, isInitiator, onComplete, onError]);

  /**
   * Cancel the running task
   */
  const cancelTask = useCallback(async () => {
    // Abort the fetch connection
    abortControllerRef.current?.abort();

    // Also call the cancel endpoint
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User cancelled' }),
      });
    } catch (e) {
      console.error('Failed to cancel task:', e);
    }

    setState((prev) => ({
      ...prev,
      isRunning: false,
    }));
  }, [taskId]);

  /**
   * Subscribe to Supabase Realtime for cross-device sync (non-initiator)
   */
  useEffect(() => {
    if (isInitiator) return; // Initiator uses SSE

    // Subscribe to task changes
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          const newTask = payload.new as {
            status: string;
            agent_progress: AgentProgressEvent[];
            failure_state: unknown;
          };

          // Update progress from the persisted array
          if (newTask.agent_progress) {
            setState((prev) => ({
              ...prev,
              progress: newTask.agent_progress,
              isRunning: newTask.status === 'working',
              currentStep: newTask.agent_progress.length > 0
                ? getStepDescription(newTask.agent_progress[newTask.agent_progress.length - 1])
                : null,
            }));
          }

          // Check if task completed
          if (newTask.status === 'done' || newTask.status === 'ready') {
            setState((prev) => ({
              ...prev,
              isRunning: false,
            }));
          }

          // Check if task failed
          if (newTask.status === 'failed' && newTask.failure_state) {
            setState((prev) => ({
              ...prev,
              isRunning: false,
              error: 'Task failed',
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, isInitiator]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    startTask,
    cancelTask,
  };
}

/**
 * Get a human-readable step description
 */
function getStepDescription(event: AgentProgressEvent): string {
  switch (event.type) {
    case 'started':
      return 'Starting...';
    case 'thinking':
      return event.message.slice(0, 100) + (event.message.length > 100 ? '...' : '');
    case 'tool_start':
      return `Running ${formatToolName(event.tool)}...`;
    case 'tool_result':
      return event.success
        ? `Completed ${formatToolName(event.tool)}`
        : `${formatToolName(event.tool)} failed`;
    case 'draft_created':
      return `Created ${event.draftType} draft`;
    case 'complete':
      return 'Completed';
    case 'error':
      return `Error: ${event.error}`;
    case 'cancelled':
      return 'Cancelled';
    case 'budget_exceeded':
      return 'Token budget exceeded';
    default:
      return 'Processing...';
  }
}

/**
 * Format tool name for display
 */
function formatToolName(toolName: string): string {
  const names: Record<string, string> = {
    gmail_search: 'Gmail search',
    gmail_read: 'email reading',
    gmail_draft: 'email draft',
    calendar_list: 'calendar check',
    calendar_create: 'calendar event',
    contacts_search: 'contacts search',
    web_search: 'web search',
    web_fetch: 'webpage reading',
  };
  return names[toolName] || toolName;
}

export default useTaskProgress;
