'use client';

/**
 * Global Agent State Context
 *
 * Tracks all running agents across tasks, allowing:
 * - Agents to continue running in background when switching views
 * - Progress indicators in task list for running agents
 * - Results to persist even when not viewing the task
 */

import { createContext, useContext, useCallback, useRef, useState, ReactNode } from 'react';
import type { AgentProgressEvent, AgentResult } from '@/lib/ai/types';

interface AgentState {
  isRunning: boolean;
  progress: AgentProgressEvent[];
  currentStep: string | null;
  result: AgentResult | null;
  error: string | null;
}

interface AgentContextValue {
  // Get state for a specific task
  getAgentState: (taskId: string) => AgentState | null;

  // Get all agent states (for watching completions)
  getAllAgentStates: () => Map<string, AgentState>;

  // Check if a task has a running agent
  isAgentRunning: (taskId: string) => boolean;

  // Start an agent for a task
  startAgent: (
    taskId: string,
    taskTitle: string,
    taskResearch: unknown,
    customPrompt?: string | null,
    onComplete?: (result: AgentResult) => void,
    onError?: (error: string) => void
  ) => void;

  // Cancel a running agent
  cancelAgent: (taskId: string) => void;

  // Get all running task IDs
  runningTaskIds: string[];
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  // Map of taskId -> AgentState
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());

  // Map of taskId -> AbortController (for cancellation)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Map of taskId -> callbacks
  const callbacksRef = useRef<Map<string, { onComplete?: (result: AgentResult) => void; onError?: (error: string) => void }>>(new Map());

  const getAgentState = useCallback((taskId: string): AgentState | null => {
    return agentStates.get(taskId) || null;
  }, [agentStates]);

  const getAllAgentStates = useCallback((): Map<string, AgentState> => {
    return agentStates;
  }, [agentStates]);

  const isAgentRunning = useCallback((taskId: string): boolean => {
    const state = agentStates.get(taskId);
    return state?.isRunning || false;
  }, [agentStates]);

  const startAgent = useCallback(async (
    taskId: string,
    taskTitle: string,
    taskResearch: unknown,
    customPrompt?: string | null,
    onComplete?: (result: AgentResult) => void,
    onError?: (error: string) => void
  ) => {
    // Don't start if already running - use ref for synchronous check (not state)
    // This prevents race conditions where state hasn't updated yet
    if (abortControllersRef.current.has(taskId)) {
      console.log(`Agent already running for task ${taskId} (abort controller exists)`);
      return;
    }

    // Store callbacks
    callbacksRef.current.set(taskId, { onComplete, onError });

    // Create abort controller with 5-minute max lifetime
    const abortController = new AbortController();
    abortControllersRef.current.set(taskId, abortController);
    const streamTimeout = setTimeout(() => {
      console.warn(`Agent stream timeout (5 min) for task ${taskId}`);
      abortController.abort();
    }, 5 * 60 * 1000);

    // Initialize state
    setAgentStates(prev => {
      const newMap = new Map(prev);
      newMap.set(taskId, {
        isRunning: true,
        progress: [],
        currentStep: 'Starting agent...',
        result: null,
        error: null,
      });
      return newMap;
    });

    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskTitle: taskTitle || 'Task',
          taskResearch: taskResearch || null,
          customPrompt: customPrompt || null,
        }),
        signal: abortController.signal,
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

        if (done) {
          setAgentStates(prev => {
            const newMap = new Map(prev);
            const state = newMap.get(taskId);
            if (state) {
              newMap.set(taskId, { ...state, isRunning: false });
            }
            return newMap;
          });
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
              const event = JSON.parse(data) as AgentProgressEvent;

              setAgentStates(prev => {
                const newMap = new Map(prev);
                const state = newMap.get(taskId);
                if (state) {
                  newMap.set(taskId, {
                    ...state,
                    progress: [...state.progress, event],
                    currentStep: getStepDescription(event),
                  });
                }
                return newMap;
              });

              // Handle completion
              if (event.type === 'complete') {
                setAgentStates(prev => {
                  const newMap = new Map(prev);
                  const state = newMap.get(taskId);
                  if (state) {
                    newMap.set(taskId, {
                      ...state,
                      isRunning: false,
                      result: event.result,
                    });
                  }
                  return newMap;
                });
                callbacksRef.current.get(taskId)?.onComplete?.(event.result);
              } else if (event.type === 'error') {
                setAgentStates(prev => {
                  const newMap = new Map(prev);
                  const state = newMap.get(taskId);
                  if (state) {
                    newMap.set(taskId, {
                      ...state,
                      isRunning: false,
                      error: event.error,
                    });
                  }
                  return newMap;
                });
                callbacksRef.current.get(taskId)?.onError?.(event.error);
              } else if (event.type === 'cancelled') {
                setAgentStates(prev => {
                  const newMap = new Map(prev);
                  const state = newMap.get(taskId);
                  if (state) {
                    newMap.set(taskId, {
                      ...state,
                      isRunning: false,
                      result: {
                        status: 'cancelled',
                        reason: event.reason,
                        completedSteps: event.completedSteps,
                        tokensUsed: 0,
                      },
                    });
                  }
                  return newMap;
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setAgentStates(prev => {
          const newMap = new Map(prev);
          const state = newMap.get(taskId);
          if (state) {
            newMap.set(taskId, {
              ...state,
              isRunning: false,
              result: {
                status: 'cancelled',
                reason: 'User cancelled',
                completedSteps: [],
                tokensUsed: 0,
              },
            });
          }
          return newMap;
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setAgentStates(prev => {
          const newMap = new Map(prev);
          const state = newMap.get(taskId);
          if (state) {
            newMap.set(taskId, {
              ...state,
              isRunning: false,
              error: errorMessage,
            });
          }
          return newMap;
        });
        callbacksRef.current.get(taskId)?.onError?.(errorMessage);
      }
    } finally {
      clearTimeout(streamTimeout);
      abortControllersRef.current.delete(taskId);
      callbacksRef.current.delete(taskId);
    }
  }, []); // No dependencies - uses refs for synchronous checks, setState is stable

  const cancelAgent = useCallback(async (taskId: string) => {
    const abortController = abortControllersRef.current.get(taskId);
    if (abortController) {
      abortController.abort();
    }

    // Also call the server cancel endpoint
    try {
      await fetch(`/api/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User cancelled' }),
      });
    } catch (e) {
      console.error('Failed to cancel task:', e);
    }

    setAgentStates(prev => {
      const newMap = new Map(prev);
      const state = newMap.get(taskId);
      if (state) {
        newMap.set(taskId, { ...state, isRunning: false });
      }
      return newMap;
    });
  }, []);

  const runningTaskIds = Array.from(agentStates.entries())
    .filter(([, state]) => state.isRunning)
    .map(([taskId]) => taskId);

  return (
    <AgentContext.Provider
      value={{
        getAgentState,
        getAllAgentStates,
        isAgentRunning,
        startAgent,
        cancelAgent,
        runningTaskIds,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }
  return context;
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
