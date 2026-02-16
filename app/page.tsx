'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { ConversationPanel } from '@/components/ConversationPanel';
import { BottomNav, MobileHeader, DeleteAccountDialog } from '@/components/Navigation';
import { QuickCaptureBar, FullScreenCapture } from '@/components/QuickCapture';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { EmptyState } from '@/components/EmptyState';
import { LoginScreen } from '@/components/LoginScreen';
import { InsightView, InsightBriefingCard, InsightDetailPanel } from '@/components/insight';
import { useTasks } from '@/hooks/useTasks';
import { useResponsive } from '@/hooks/useResponsive';
import { useInsightScan } from '@/hooks/useInsightScan';
import { useAgentContext } from '@/contexts/AgentContext';
import type { InsightAction } from '@/lib/scan/types';
import type { PendingDraft as AgentPendingDraft, EmailDraft, CalendarEventDraft, AgentProgressEvent } from '@/lib/ai/types';
import type { PendingDraft as LocalPendingDraft } from '@/hooks/useInsightScan';
import type { AgentStepSummary } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

type ViewMode = 'active' | 'completed' | 'archived' | 'insights';

/**
 * Transform agent pendingDrafts to local format for display
 */
function transformPendingDrafts(drafts: AgentPendingDraft[] | undefined): LocalPendingDraft[] {
  if (!drafts) return [];
  return drafts.map(draft => {
    if (draft.type === 'email_draft') {
      const emailData = draft.data as EmailDraft;
      return {
        type: 'email' as const,
        content: emailData.body,
        to: emailData.to?.[0],
        subject: emailData.subject,
        threadId: emailData.threadId,
      };
    } else {
      const calendarData = draft.data as CalendarEventDraft;
      return {
        type: 'calendar' as const,
        content: calendarData.description || '',
        eventDetails: {
          title: calendarData.summary,
          start: calendarData.start.dateTime,
          end: calendarData.end.dateTime,
          attendees: calendarData.attendees?.map(a => a.email),
        },
      };
    }
  });
}

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-inbox-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-inbox-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <AuthenticatedHome />;
}

function AuthenticatedHome() {
  const handleSignOut = useCallback(() => {
    signOut();
  }, []);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/user', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      // Sign out after successful deletion
      signOut({ callbackUrl: '/' });
    } catch {
      setDeleting(false);
      alert('Failed to delete account. Please try again.');
    }
  }, []);

  const {
    tasks,
    activeTasks,
    completedTasks,
    archivedTasks,
    insightTasks,
    isLoading,
    addTask,
    completeTask,
    archiveTask,
    restoreTask,
    deleteTask,
    reorderTasks,
    togglePin,
    addChatMessage,
    setAgentQuickInfo,
    setAgentSteps,
  } = useTasks();
  const { isMobile } = useResponsive();
  const scan = useInsightScan();
  const agent = useAgentContext();
  const [viewMode, setViewMode] = useState<ViewMode>('active');

  // Track which actionId corresponds to which taskId for insight actions
  const insightActionTaskMapRef = useRef<Map<string, string>>(new Map());

  // Track which agent completions we've persisted (to avoid duplicates)
  const persistedAgentResultsRef = useRef<Set<string>>(new Set());

  // Helper: Convert agent progress events to step summaries for persistence
  const eventsToStepSummaries = useCallback((events: AgentProgressEvent[]): AgentStepSummary[] => {
    const steps: AgentStepSummary[] = [];
    const toolResultMap = new Map<string, { success: boolean; durationMs: number }>();
    for (const event of events) {
      if (event.type === 'tool_result') {
        toolResultMap.set(event.tool, { success: event.success, durationMs: event.duration_ms });
      }
    }
    const seenTools = new Set<string>();
    for (const event of events) {
      if (event.type === 'tool_start') {
        if (!seenTools.has(event.tool)) {
          seenTools.add(event.tool);
          const result = toolResultMap.get(event.tool);
          let detail: string | null = null;
          if (event.tool === 'gmail_search' || event.tool === 'web_search') {
            detail = event.args.query ? `"${event.args.query}"` : null;
          }
          steps.push({ tool: event.tool, detail, durationMs: result?.durationMs });
        }
      }
    }
    return steps;
  }, []);

  // Persist agent results when they complete (works even when viewing different task)
  useEffect(() => {
    const allStates = agent.getAllAgentStates();

    for (const [taskId, state] of allStates) {
      // Skip if already persisted or not completed
      if (persistedAgentResultsRef.current.has(taskId)) continue;
      if (!state.result || state.result.status !== 'completed') continue;

      // Now TypeScript knows result.status === 'completed', so it has message/quickInfo
      const result = state.result;

      // Mark as persisted
      persistedAgentResultsRef.current.add(taskId);

      // Find the task to check for duplicates
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      // Persist message to chatMessages
      if (result.message) {
        const existingMessages = task.chatMessages || [];
        const isDuplicate = existingMessages.some(
          m => m.role === 'assistant' && m.content === result.message
        );
        if (!isDuplicate) {
          addChatMessage(taskId, {
            id: uuidv4(),
            role: 'assistant',
            content: result.message,
            timestamp: Date.now(),
          });
        }
      }

      // Persist quickInfo
      if (result.quickInfo) {
        setAgentQuickInfo(taskId, result.quickInfo);
      }

      // Persist agent steps
      if (state.progress.length > 0) {
        const stepSummaries = eventsToStepSummaries(state.progress);
        if (stepSummaries.length > 0) {
          setAgentSteps(taskId, stepSummaries);
        }
      }
    }
  }, [agent, tasks, addChatMessage, setAgentQuickInfo, setAgentSteps, eventsToStepSummaries]);

  // Extract protected senders from active "Reply to X" tasks
  const protectedSenders = useMemo(() => {
    const senders: string[] = [];
    for (const task of tasks) {
      // Skip completed/archived tasks
      if (task.status === 'completed' || task.status === 'archived') continue;
      // Match "Reply to X:" or "Reply to X" patterns
      const match = task.title.match(/^Reply to ([^:]+)/);
      if (match) {
        senders.push(match[1].trim());
      }
    }
    return senders;
  }, [tasks]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [insightSelected, setInsightSelected] = useState(false);
  const [selectedInsightActionId, setSelectedInsightActionId] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [captureVoice, setCaptureVoice] = useState(false);
  const [autoStartAgentTaskId, setAutoStartAgentTaskId] = useState<string | null>(null);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const isTaskSelected = selectedTaskId !== null && selectedTask !== null;
  const isPanelOpen = isTaskSelected || insightSelected;

  // Find selected insight action for 3-pane layout
  const selectedInsightAction = useMemo(() => {
    if (!selectedInsightActionId) return null;
    // Check quickWin
    if (scan.quickWin?.id === selectedInsightActionId) return scan.quickWin;
    // Check bundles
    for (const bundle of scan.bundles) {
      const found = bundle.items.find(item => item.id === selectedInsightActionId);
      if (found) return found;
    }
    return null;
  }, [selectedInsightActionId, scan.quickWin, scan.bundles]);

  // Determine if we should show 3-pane layout (insight + detail selected)
  const isThreePaneLayout = insightSelected && selectedInsightAction !== null;

  const counts: Record<ViewMode, number> = {
    active: activeTasks.length,
    completed: completedTasks.length,
    archived: archivedTasks.length,
    insights: 0, // Not used for insights tab
  };

  // Start agent for insight tasks (they don't have ConversationPanel to start it)
  useEffect(() => {
    if (!autoStartAgentTaskId) return;

    // Find the task - could be in tasks array (insight tasks are hidden from activeTasks)
    const task = tasks.find(t => t.id === autoStartAgentTaskId);
    if (!task) return;

    // On desktop, regular tasks use ConversationPanel to start the agent.
    // On mobile, we stay on the task list, so we start the agent here directly.
    if (task.source !== 'insight' && !isMobile) return;

    // Check if agent is already running
    if (agent.isAgentRunning(task.id)) return;

    // Find the actionId that corresponds to this taskId
    const actionId = Array.from(insightActionTaskMapRef.current.entries())
      .find(([, tid]) => tid === task.id)?.[0];

    // Start the agent
    agent.startAgent(
      task.id,
      task.title,
      task.research,
      task.customPrompt,
      // onComplete callback
      (result) => {
        // Only process completed results with message
        if (result.status === 'completed') {
          if (actionId) {
            // Update the scan action state with the result
            scan.setActionResult(actionId, {
              message: result.message,
              quickInfo: result.quickInfo,
              pendingDrafts: transformPendingDrafts(result.pendingDrafts),
            });
          }
          // Also update the task with the result
          if (result.quickInfo) {
            setAgentQuickInfo(task.id, result.quickInfo);
          }
          if (result.message) {
            addChatMessage(task.id, {
              id: `agent-result-${Date.now()}`,
              role: 'assistant',
              content: result.message,
              timestamp: Date.now(),
            });
          }
        } else if (actionId) {
          // Handle non-completed states as errors
          const errorMessage = result.status === 'cancelled'
            ? `Cancelled: ${result.reason}`
            : result.status === 'budget_exceeded'
              ? 'Token budget exceeded'
              : result.status === 'failed'
                ? result.reason
                : 'Unknown error';
          scan.setActionFailed(actionId, errorMessage);
        }
      },
      // onError callback
      (error) => {
        if (actionId) {
          scan.setActionFailed(actionId, error);
        }
      }
    );

    // Clear the auto-start flag
    setAutoStartAgentTaskId(null);
  }, [autoStartAgentTaskId, tasks, agent, scan, setAgentQuickInfo, addChatMessage, isMobile]);

  // Watch for insight task completion and update scan action states
  useEffect(() => {
    // Check all actionStates with taskIds
    for (const [actionId, state] of Object.entries(scan.actionStates)) {
      if (state.status !== 'in_progress' || !state.taskId) continue;

      // Check if agent finished
      const agentState = agent.getAgentState(state.taskId);
      if (agentState && !agentState.isRunning && agentState.result) {
        const result = agentState.result;
        if (result.status === 'completed') {
          scan.setActionResult(actionId, {
            message: result.message,
            quickInfo: result.quickInfo,
            pendingDrafts: transformPendingDrafts(result.pendingDrafts),
          });
        } else {
          const errorMessage = result.status === 'cancelled'
            ? `Cancelled: ${result.reason}`
            : result.status === 'budget_exceeded'
              ? 'Token budget exceeded'
              : result.status === 'failed'
                ? result.reason
                : 'Unknown error';
          scan.setActionFailed(actionId, errorMessage);
        }
      } else if (agentState && !agentState.isRunning && agentState.error) {
        scan.setActionFailed(actionId, agentState.error);
      }
    }
  }, [scan.actionStates, agent, scan]);

  // Reconcile action states with insight tasks on mount
  // This catches any tasks that completed while user was away or after refresh
  useEffect(() => {
    if (insightTasks.length === 0) return;
    scan.reconcileWithTasks(insightTasks, agent.getAgentState);
  // Only run on mount and when insightTasks change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightTasks.length]);

  const handleAddTask = useCallback(async (title: string) => {
    const newTask = addTask(title);
    setShowCapture(false);

    // ALL tasks go to Claude Opus agent
    // The agent will handle everything: research, email, calendar, web search, etc.
    setAutoStartAgentTaskId(newTask.id);

    // On desktop, open the task detail panel. On mobile, stay on the list
    // so the user sees the task captured and can quickly add another.
    if (!isMobile) {
      setSelectedTaskId(newTask.id);
    }
  }, [addTask, isMobile]);

  const handleShowDetails = useCallback((taskId: string) => {
    // Toggle selection - clicking same task again closes detail view
    setInsightSelected(false);
    setSelectedTaskId(prev => prev === taskId ? null : taskId);
  }, []);

  const handleShowInsights = useCallback(() => {
    setSelectedTaskId(null);
    setInsightSelected(true);
    // Start scan with protected senders if idle
    if (scan.phase === 'idle') {
      scan.startScan(false, { protectedSenders });
    }
  }, [scan, protectedSenders]);

  // Find and select a task by meeting title (for "View prep" in insight scan)
  const handleSelectPrepTask = useCallback((meetingTitle: string) => {
    // Task title pattern: "Prepare for: {meetingTitle}"
    const matchingTask = tasks.find(t =>
      t.title === `Prepare for: ${meetingTitle}` ||
      t.title.includes(meetingTitle)
    );
    if (matchingTask) {
      setInsightSelected(false);
      setSelectedTaskId(matchingTask.id);
    } else {
      // If no matching task found, just close the insight panel
      setInsightSelected(false);
    }
  }, [tasks]);

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
    setInsightSelected(false);
  }, []);

  const currentTasks = viewMode === 'active'
    ? activeTasks
    : viewMode === 'completed'
      ? completedTasks
      : archivedTasks;

  // Mobile Layout - Inbox style
  if (isMobile) {
    // Show full-screen InsightView when insights tab is selected
    if (viewMode === 'insights') {
      return (
        <div
          className="fixed inset-0 z-50 bg-inbox-bg-primary flex flex-col animate-slide-in-from-right"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {/* Header with back arrow */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-inbox-divider">
            <button
              onClick={() => setViewMode('active')}
              className="p-2 -ml-2 rounded-full text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
              aria-label="Back"
            >
              <MaterialIcon name="arrow_back" size={24} />
            </button>
            <h2 className="flex-1 text-inbox-body font-medium text-inbox-text-primary">
              Proactive todos
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <InsightView
              onClose={() => setViewMode('active')}
              onCreateTask={(title, customPrompt, actionId) => {
                // Create task with 'insight' source so it's hidden from main task list
                const newTask = addTask(title, customPrompt, 'insight');
                // Track actionId → taskId mapping for completion callback
                if (actionId) {
                  insightActionTaskMapRef.current.set(actionId, newTask.id);
                }
                // Stay in insights view - task runs in background
                // Auto-start the agent for this task
                setAutoStartAgentTaskId(newTask.id);
              }}
              onSelectTask={(taskTitle) => {
                // Called from "Open full task" in peek panel
                const matchingTask = tasks.find(t =>
                  t.title === taskTitle ||
                  t.title.includes(taskTitle)
                );
                if (matchingTask) {
                  setViewMode('active');
                  setSelectedTaskId(matchingTask.id);
                }
              }}
              tasks={tasks}
            />
          </div>
          <FullScreenCapture
            isOpen={showCapture}
            onClose={() => {
              setShowCapture(false);
              setCaptureVoice(false);
            }}
            onSave={handleAddTask}
            startWithVoice={captureVoice}
          />
        </div>
      );
    }

    // Full-screen task detail view (replaces BottomSheet)
    if (isTaskSelected && selectedTask) {
      return (
        <div
          className="fixed inset-0 z-50 bg-inbox-bg-primary flex flex-col animate-slide-in-from-right"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {/* Detail header with back arrow + title */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-inbox-divider">
            <button
              onClick={handleClosePanel}
              className="p-2 -ml-2 rounded-full text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
              aria-label="Back"
            >
              <MaterialIcon name="arrow_back" size={24} />
            </button>
            <h2 className="flex-1 text-inbox-body font-medium text-inbox-text-primary truncate">
              {selectedTask.title}
            </h2>
          </div>
          {/* Full ConversationPanel */}
          <div className="flex-1 overflow-hidden">
            <ConversationPanel
              task={selectedTask}
              onClose={handleClosePanel}
              onAddChatMessage={addChatMessage}
              onComplete={completeTask}
              onArchive={archiveTask}
              onDelete={deleteTask}
              onTogglePin={togglePin}
              onUpdateQuickInfo={setAgentQuickInfo}
              onUpdateAgentSteps={setAgentSteps}
              autoStartAgent={autoStartAgentTaskId === selectedTask.id}
              onAgentStarted={() => setAutoStartAgentTaskId(null)}
              isMobile
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-inbox-bg-primary pb-32">
        <MobileHeader onSignOut={handleSignOut} onDeleteAccount={() => setDeleteDialogOpen(true)} />
        <DeleteAccountDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleDeleteAccount}
          deleting={deleting}
        />

        <main key={viewMode} className="px-4 py-4 animate-fade-in">
          {/* Insight Briefing Card - lives at top of task list */}
          {viewMode === 'active' && (
            <div className="mb-3">
              <InsightBriefingCard
                onClick={() => setViewMode('insights')}
              />
            </div>
          )}

          <TaskList
            tasks={currentTasks}
            onComplete={completeTask}
            onArchive={archiveTask}
            onDelete={deleteTask}
            onRestore={restoreTask}
            onShowDetails={handleShowDetails}
            onReorder={reorderTasks}
            onTogglePin={togglePin}
          />

          {currentTasks.length === 0 && !isLoading && (
            <EmptyState viewMode={viewMode} />
          )}
        </main>

        <QuickCaptureBar
          onTap={() => {
            setCaptureVoice(false);
            setShowCapture(true);
          }}
          onMicTap={() => {
            setCaptureVoice(true);
            setShowCapture(true);
          }}
        />

        <BottomNav
          currentView={viewMode}
          onViewChange={setViewMode}
          counts={counts}
        />

        <FullScreenCapture
          isOpen={showCapture}
          onClose={() => {
            setShowCapture(false);
            setCaptureVoice(false);
          }}
          onSave={handleAddTask}
          startWithVoice={captureVoice}
        />
      </div>
    );
  }

  // Desktop Layout - Inbox style: Two states - clean list OR 2-pane
  return (
    <div className="h-screen bg-inbox-bg-secondary flex flex-col overflow-hidden">
      {/* Header with filter tabs - Inbox style */}
      <header className="flex-shrink-0 bg-inbox-bg-primary border-b border-inbox-divider px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-inbox-headline text-inbox-text-primary flex items-center gap-2">
              <MaterialIcon name="task_alt" size={28} className="text-inbox-accent" fill />
              Todone
            </h1>

            {/* Filter tabs - Inbox style */}
            <div className="flex items-center gap-1 ml-6">
              <FilterBubble
                active={viewMode === 'active'}
                onClick={() => setViewMode('active')}
                count={counts.active}
                icon="radio_button_unchecked"
                iconActive="task_alt"
              >
                Active
              </FilterBubble>
              <FilterBubble
                active={viewMode === 'completed'}
                onClick={() => setViewMode('completed')}
                count={counts.completed}
                icon="check_circle"
                iconActive="check_circle"
              >
                Done
              </FilterBubble>
              <FilterBubble
                active={viewMode === 'archived'}
                onClick={() => setViewMode('archived')}
                count={counts.archived}
                icon="inventory_2"
                iconActive="inventory_2"
              >
                Archived
              </FilterBubble>
            </div>
          </div>

          {/* Sign out button */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary hover:text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors"
          >
            <MaterialIcon name="logout" size={16} weight={300} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task List Panel - narrower in 3-pane layout */}
        <div className={`
          flex flex-col bg-inbox-bg-primary
          transition-all duration-200
          ${isThreePaneLayout
            ? 'w-[280px] min-w-[240px] flex-shrink-0 border-r border-inbox-divider'
            : isPanelOpen
              ? 'w-[380px] min-w-[320px] flex-shrink-0 border-r border-inbox-divider'
              : 'flex-1'
          }
        `}>
          {/* Centered content wrapper - constrains width when single-pane */}
          <div className={`
            flex-1 flex flex-col min-h-0
            ${isPanelOpen ? '' : 'max-w-[720px] mx-auto w-full'}
          `}>
            {/* Task input - Inbox style */}
            <div className={`px-4 py-4 ${!isPanelOpen ? 'px-6 py-6 border-b border-inbox-divider' : ''}`}>
              <TaskInput onAddTask={handleAddTask} />
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {/* Insight Briefing Card - at top of active tasks */}
              {viewMode === 'active' && (
                <div className={`${isPanelOpen ? 'px-4 py-2' : 'px-6 py-3'}`}>
                  <InsightBriefingCard
                    onClick={handleShowInsights}
                    isSelected={insightSelected}
                  />
                </div>
              )}

              <TaskList
                tasks={currentTasks}
                onComplete={completeTask}
                onArchive={archiveTask}
                onDelete={deleteTask}
                onRestore={restoreTask}
                onShowDetails={handleShowDetails}
                onReorder={reorderTasks}
                onTogglePin={togglePin}
                selectedTaskId={selectedTaskId}
                compact={isPanelOpen}
              />

              {currentTasks.length === 0 && !isLoading && viewMode !== 'insights' && (
                <EmptyState viewMode={viewMode} compact={isPanelOpen} />
              )}
            </div>
          </div>
        </div>

        {/* Middle Panel - InsightView (in 3-pane layout, just the list) */}
        {insightSelected && (
          <div className={`
            flex flex-col bg-inbox-bg-primary border-r border-inbox-divider
            ${isThreePaneLayout ? 'w-[320px] flex-shrink-0' : 'flex-1 min-w-0'}
          `}>
            <InsightView
              onClose={handleClosePanel}
              onCreateTask={(title, customPrompt, actionId) => {
                // Create task with 'insight' source so it's hidden from main task list
                const newTask = addTask(title, customPrompt, 'insight');
                // Track actionId → taskId mapping for completion callback
                if (actionId) {
                  insightActionTaskMapRef.current.set(actionId, newTask.id);
                }
                // Stay in Heads up section - panel stays open
                // Agent runs in background via AgentContext
                // Auto-start the agent for this task (runs in background)
                setAutoStartAgentTaskId(newTask.id);
              }}
              onSelectTask={handleSelectPrepTask}
              tasks={tasks}
              scan={scan}
              selectedActionId={selectedInsightActionId}
              onSelectAction={setSelectedInsightActionId}
              externalDetail={true}
            />
          </div>
        )}

        {/* Right Panel - Task Details OR Insight Detail */}
        {(isTaskSelected || isThreePaneLayout) && (
          <div className="flex-1 min-w-0 h-full overflow-hidden bg-inbox-bg-primary">
            {isThreePaneLayout && selectedInsightAction ? (
              <InsightDetailPanel
                action={selectedInsightAction}
                actionState={scan.getActionState(selectedInsightAction.id)}
                onExecute={async (actionId, userInput, replyMode) => {
                  const result = await scan.executeAction(actionId, userInput, replyMode);
                  if (result.success && result.taskTitle) {
                    // Create hidden task with 'insight' source
                    const newTask = addTask(result.taskTitle, result.customPrompt, 'insight');
                    // Track actionId → taskId mapping for completion callback
                    insightActionTaskMapRef.current.set(actionId, newTask.id);
                    // NOTE: Panel stays open - we do NOT clear selectedInsightActionId
                    // The action state is tracked in scan.actionStates
                    // Auto-start the agent for this task (runs in background)
                    setAutoStartAgentTaskId(newTask.id);
                  }
                  return result;
                }}
                onDismiss={scan.dismissAction}
                onClose={() => setSelectedInsightActionId(null)}
                getEmailContent={scan.getEmailContent}
              />
            ) : selectedTask ? (
              <ConversationPanel
                task={selectedTask}
                onClose={handleClosePanel}
                onAddChatMessage={addChatMessage}
                onComplete={completeTask}
                onArchive={archiveTask}
                onDelete={deleteTask}
                onTogglePin={togglePin}
                onUpdateQuickInfo={setAgentQuickInfo}
                onUpdateAgentSteps={setAgentSteps}
                                autoStartAgent={autoStartAgentTaskId === selectedTask.id}
                onAgentStarted={() => setAutoStartAgentTaskId(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

interface FilterBubbleProps {
  active: boolean;
  onClick: () => void;
  count: number;
  icon: string;
  iconActive: string;
  children: React.ReactNode;
  hideCount?: boolean;
}

// Inbox-style filter tabs
function FilterBubble({ active, onClick, count, icon, iconActive, children, hideCount }: FilterBubbleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-4 py-2
        rounded-full text-inbox-body font-medium
        transition-colors duration-100
        ${active
          ? 'bg-inbox-accent-light text-inbox-accent'
          : 'text-inbox-text-secondary hover:bg-inbox-bg-hover'
        }
      `}
    >
      <MaterialIcon
        name={active ? iconActive : icon}
        size={18}
        weight={300}
        fill={active}
      />
      {children}
      {!hideCount && count > 0 && (
        <span className="text-inbox-caption ml-1">
          {count}
        </span>
      )}
    </button>
  );
}
