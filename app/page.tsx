'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { ConversationPanel } from '@/components/ConversationPanel';
import { MobileHeader, DesktopAccountMenu, DeleteAccountDialog } from '@/components/Navigation';
import { QuickCaptureBar, FullScreenCapture } from '@/components/QuickCapture';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { EmptyState } from '@/components/EmptyState';
import { LoginScreen } from '@/components/LoginScreen';
import { InsightView, InsightDetailPanel, InsightBriefingCard } from '@/components/insight';
import { useTasks } from '@/hooks/useTasks';
import { useResponsive } from '@/hooks/useResponsive';
import { useInsightScan } from '@/hooks/useInsightScan';
import { useAgentContext } from '@/contexts/AgentContext';
import type { InsightAction, MeetingPrepContext } from '@/lib/scan/types';
import type { PendingDraft as AgentPendingDraft, EmailDraft, CalendarEventDraft, AgentProgressEvent } from '@/lib/ai/types';
import type { PendingDraft as LocalPendingDraft } from '@/hooks/useInsightScan';
import type { AgentStepSummary } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

type ViewMode = 'active' | 'completed' | 'someday' | 'insights';

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
    somedayTasks,
    insightTasks,
    isLoading,
    addTask,
    completeTask,
    somedayTask,
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

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [insightSelected, setInsightSelected] = useState(false);
  // For email insight actions — show InsightDetailPanel instead of ConversationPanel
  const [selectedInsightActionId, setSelectedInsightActionId] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [captureVoice, setCaptureVoice] = useState(false);
  const [autoStartAgentTaskId, setAutoStartAgentTaskId] = useState<string | null>(null);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const isTaskSelected = selectedTaskId !== null && selectedTask !== null;

  // Find selected insight action for email detail panel
  const selectedInsightAction = useMemo(() => {
    if (!selectedInsightActionId) return null;
    if (scan.quickWin?.id === selectedInsightActionId) return scan.quickWin;
    for (const bundle of scan.bundles) {
      const found = bundle.items.find(item => item.id === selectedInsightActionId);
      if (found) return found;
    }
    return null;
  }, [selectedInsightActionId, scan.quickWin, scan.bundles]);

  // Has a right panel open (task ConversationPanel or email InsightDetailPanel)
  const hasRightPanel = isTaskSelected || selectedInsightAction !== null;

  // Compute highlight for the insight list: either the email action or the meeting's mapped action
  const activeInsightActionId = useMemo(() => {
    // Direct email selection
    if (selectedInsightActionId) return selectedInsightActionId;
    // Meeting task selection — find which action maps to it
    if (selectedTaskId) {
      for (const [actionId, taskId] of insightActionTaskMapRef.current.entries()) {
        if (taskId === selectedTaskId) return actionId;
      }
    }
    return null;
  }, [selectedInsightActionId, selectedTaskId]);

  // (briefingDot and counts removed — briefing is now a card in the task list)

  // Start agent for insight tasks (they don't have ConversationPanel to start it)
  useEffect(() => {
    if (!autoStartAgentTaskId) return;

    // Find the task - could be in tasks array (insight tasks are hidden from activeTasks)
    const task = tasks.find(t => t.id === autoStartAgentTaskId);
    if (!task) return;

    // On desktop, regular tasks use ConversationPanel to start the agent.
    // On mobile, we stay on the task list, so we start the agent here directly.
    // For insight tasks shown in ConversationPanel, let ConversationPanel handle auto-start.
    if (task.source === 'insight' && selectedTaskId === task.id) {
      // ConversationPanel is visible for this task — it will handle auto-start
      return;
    }
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
  }, [autoStartAgentTaskId, tasks, agent, scan, setAgentQuickInfo, addChatMessage, isMobile, selectedTaskId]);

  // Watch for insight task completion and update scan action states
  useEffect(() => {
    // Check all actionStates with taskIds
    for (const [actionId, state] of Object.entries(scan.actionStates)) {
      if (state.status !== 'in_progress') continue;

      // The execute API returns a server-generated taskId, but the actual task
      // created by addTask() has a different ID stored in insightActionTaskMapRef.
      // Check both to find the running agent.
      const actualTaskId = insightActionTaskMapRef.current.get(actionId) || state.taskId;
      if (!actualTaskId) continue;

      // Check if agent finished
      const agentState = agent.getAgentState(actualTaskId);
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

  // Handle insight action click — meetings create task + ConversationPanel, emails open InsightDetailPanel
  const handleInsightActionClick = useCallback(async (action: InsightAction) => {
    // For already-prepped emails, open the existing task's ConversationPanel directly
    if (action.type !== 'meeting_prep') {
      const ctx = action.context as { alreadyPrepped?: boolean; preppedTaskId?: string; threadId?: string };
      if (ctx?.preppedTaskId) {
        const existingTask = tasks.find(t => t.id === ctx.preppedTaskId);
        if (existingTask) {
          insightActionTaskMapRef.current.set(action.id, ctx.preppedTaskId);
          setSelectedInsightActionId(null);
          setSelectedTaskId(ctx.preppedTaskId);
          return;
        }
      }
      // Fallback: find task by sourceRef matching threadId (works after reload with cached scans)
      if (ctx?.threadId) {
        const sourceRefMatch = tasks.find(t => t.source === 'insight' && t.sourceRef === ctx.threadId);
        if (sourceRefMatch) {
          insightActionTaskMapRef.current.set(action.id, sourceRefMatch.id);
          setSelectedInsightActionId(null);
          setSelectedTaskId(sourceRefMatch.id);
          return;
        }
      }
      // Fresh email — show InsightDetailPanel (no task creation yet)
      setSelectedTaskId(null); // Clear any meeting ConversationPanel
      setSelectedInsightActionId(action.id);
      return;
    }

    // Meetings: create/find task → show ConversationPanel
    setSelectedInsightActionId(null); // Clear any email detail panel

    // 1. Check if action already has a task via our map
    const existingTaskId = insightActionTaskMapRef.current.get(action.id);
    if (existingTaskId) {
      const existingTask = tasks.find(t => t.id === existingTaskId);
      if (existingTask) {
        setSelectedTaskId(existingTaskId);
        return;
      }
    }

    // 2. Check if action has a taskId in scan actionStates
    const actionState = scan.actionStates[action.id];
    if (actionState?.taskId) {
      const existingTask = tasks.find(t => t.id === actionState.taskId);
      if (existingTask) {
        insightActionTaskMapRef.current.set(action.id, actionState.taskId);
        setSelectedTaskId(actionState.taskId);
        return;
      }
    }

    // 3. For already-prepped items, check preppedTaskId from durable task lookup
    const meetingCtx = action.context as MeetingPrepContext;
    if (meetingCtx?.preppedTaskId) {
      const existingTask = tasks.find(t => t.id === meetingCtx.preppedTaskId);
      if (existingTask) {
        insightActionTaskMapRef.current.set(action.id, meetingCtx.preppedTaskId);
        setSelectedTaskId(meetingCtx.preppedTaskId);
        return;
      }
    }

    // 3b. Legacy fallback: check preppedActionId in ref map
    if (meetingCtx?.alreadyPrepped && meetingCtx?.preppedActionId) {
      const preppedId = meetingCtx.preppedActionId;
      const legacyTaskId = insightActionTaskMapRef.current.get(preppedId);
      if (legacyTaskId) {
        const existingTask = tasks.find(t => t.id === legacyTaskId);
        if (existingTask) {
          insightActionTaskMapRef.current.set(action.id, legacyTaskId);
          setSelectedTaskId(legacyTaskId);
          return;
        }
      }
    }

    // 3c. Definitive fallback: find task by sourceRef matching eventId
    // Works after page reload with cached scans (where preppedTaskId isn't set)
    const eventId = meetingCtx?.eventId;
    if (eventId) {
      const sourceRefMatch = tasks.find(t => t.source === 'insight' && t.sourceRef === eventId);
      if (sourceRefMatch) {
        insightActionTaskMapRef.current.set(action.id, sourceRefMatch.id);
        setSelectedTaskId(sourceRefMatch.id);
        return;
      }
    }

    // 3d. Title match as last resort
    if (meetingCtx?.alreadyPrepped) {
      const titleMatch = tasks.find(t =>
        t.source === 'insight' &&
        t.title.includes(meetingCtx.title || action.headline)
      );
      if (titleMatch) {
        insightActionTaskMapRef.current.set(action.id, titleMatch.id);
        setSelectedTaskId(titleMatch.id);
        return;
      }
    }

    // 4. New meeting — execute and create task with sourceRef, auto-start agent
    const result = await scan.executeAction(action.id);
    if (result.success && result.taskTitle) {
      const sourceRef = meetingCtx?.eventId || null;
      const newTask = addTask(result.taskTitle, result.customPrompt, 'insight', sourceRef);
      insightActionTaskMapRef.current.set(action.id, newTask.id);
      setAutoStartAgentTaskId(newTask.id);
      setSelectedTaskId(newTask.id);
    }
  }, [tasks, scan, addTask]);

  // Handler for InsightDetailPanel executing an email action (Draft for me / Write it myself)
  const handleEmailExecute = useCallback(async (actionId: string, userInput?: string, replyMode?: 'draft' | 'write') => {
    // Find the action to extract threadId for sourceRef
    const allActions: InsightAction[] = [];
    if (scan.quickWin) allActions.push(scan.quickWin);
    for (const bundle of scan.bundles) {
      for (const item of bundle.items) allActions.push(item);
    }
    const action = allActions.find(a => a.id === actionId);
    const threadId = (action?.context as { threadId?: string })?.threadId || null;

    const result = await scan.executeAction(actionId, userInput, replyMode);
    if (result.success && result.taskTitle) {
      // Create hidden task with 'insight' source + threadId as sourceRef
      const newTask = addTask(result.taskTitle, result.customPrompt, 'insight', threadId);
      insightActionTaskMapRef.current.set(actionId, newTask.id);
      // Auto-start the agent for this email task
      setAutoStartAgentTaskId(newTask.id);
    }
    return result;
  }, [scan, addTask]);

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
    setSelectedInsightActionId(null);
    setSelectedTaskId(prev => prev === taskId ? null : taskId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedInsightActionId(null);
    setInsightSelected(false);
  }, []);

  // Close right panel but stay in insights list
  const handleCloseRightPanelInInsight = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedInsightActionId(null);
    // Keep insightSelected true so user returns to insight list
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl+1 = Tasks, Cmd/Ctrl+2 = Briefing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '1') {
        e.preventDefault();
        setViewMode('active');
        setSelectedTaskId(null);
        setSelectedInsightActionId(null);
      } else if (e.key === '2') {
        e.preventDefault();
        setViewMode('insights');
        setSelectedTaskId(null);
        setSelectedInsightActionId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Clear selection when switching modes to avoid stale right panels
  const handleViewChange = useCallback((newView: ViewMode) => {
    const prevMode = viewMode === 'insights' ? 'briefing' : 'tasks';
    const newMode = newView === 'insights' ? 'briefing' : 'tasks';
    if (prevMode !== newMode) {
      setSelectedTaskId(null);
      setSelectedInsightActionId(null);
    }
    setViewMode(newView);
  }, [viewMode]);

  const currentTasks = viewMode === 'active'
    ? activeTasks
    : viewMode === 'completed'
      ? completedTasks
      : somedayTasks;

  // Mobile Layout - Inbox style
  if (isMobile) {
    // Task detail (meeting ConversationPanel) takes priority over insights view
    if (isTaskSelected && selectedTask) {
      return (
        <div
          className="fixed inset-0 z-50 bg-inbox-bg-primary flex flex-col animate-slide-in-from-right"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {/* Detail header with back arrow + title */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-inbox-divider">
            <button
              onClick={viewMode === 'insights' ? handleCloseRightPanelInInsight : handleClosePanel}
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
              onClose={viewMode === 'insights' ? handleCloseRightPanelInInsight : handleClosePanel}
              onAddChatMessage={addChatMessage}
              onComplete={completeTask}
              onSomeday={somedayTask}
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
      <div className="min-h-screen bg-inbox-bg-primary pb-20">
        <MobileHeader
          onViewChange={handleViewChange}
          onSignOut={handleSignOut}
          onDeleteAccount={() => setDeleteDialogOpen(true)}
        />
        <DeleteAccountDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleDeleteAccount}
          deleting={deleting}
        />

        {viewMode === 'insights' ? (
          <div className="flex-1 overflow-hidden animate-fade-in">
            <div className="px-4 pt-3 pb-1">
              <button
                onClick={() => setViewMode('active')}
                className="flex items-center gap-1 text-sm text-inbox-text-secondary active:text-inbox-text-primary transition-colors"
              >
                <MaterialIcon name="arrow_back" size={16} />
                Back to tasks
              </button>
            </div>
            <InsightView
              onClose={() => setViewMode('active')}
              onActionClick={handleInsightActionClick}
              scan={scan}
              selectedActionId={activeInsightActionId}
            />
          </div>
        ) : (
          <main key={viewMode} className="px-4 py-4 animate-fade-in">
            {(viewMode === 'completed' || viewMode === 'someday') && (
              <button
                onClick={() => setViewMode('active')}
                className="flex items-center gap-1 text-sm text-inbox-text-secondary mb-3 active:text-inbox-text-primary transition-colors"
              >
                <MaterialIcon name="arrow_back" size={16} />
                Back to tasks
              </button>
            )}

            {viewMode === 'active' && (
              <InsightBriefingCard
                scan={scan}
                onClick={() => {
                  handleViewChange('insights');
                  if (scan.phase === 'idle') scan.startScan(false);
                }}
              />
            )}

            <TaskList
              tasks={currentTasks}
              onComplete={completeTask}
              onSomeday={somedayTask}
              onDelete={deleteTask}
              onRestore={restoreTask}
              onShowDetails={handleShowDetails}
              onReorder={reorderTasks}
              onTogglePin={togglePin}
            />

            {currentTasks.length === 0 && !isLoading && (
              <EmptyState viewMode={viewMode as 'active' | 'completed' | 'someday'} />
            )}
          </main>
        )}

        {viewMode === 'active' && (
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
        )}

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

  // Desktop Layout - Tasks with InsightBriefingCard as first row, 1-pane or 2-pane
  return (
    <div className="h-screen bg-inbox-bg-secondary flex flex-col overflow-hidden">
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteAccount}
        deleting={deleting}
      />
      {/* Header - just logo + account menu */}
      <header className="flex-shrink-0 bg-inbox-bg-primary border-b border-inbox-divider px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-inbox-headline text-inbox-text-primary flex items-center gap-2">
            <MaterialIcon name="task_alt" size={28} className="text-inbox-accent" fill />
            Todone
          </h1>
          <DesktopAccountMenu
            onSignOut={handleSignOut}
            onDeleteAccount={() => setDeleteDialogOpen(true)}
            onViewChange={handleViewChange}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: TaskInput + Pill Toggle + (Task List OR InsightView) */}
        <div className={`
          flex flex-col bg-inbox-bg-primary
          transition-all duration-200
          ${hasRightPanel
            ? 'w-[380px] min-w-[320px] flex-shrink-0 border-r border-inbox-divider'
            : 'flex-1'
          }
        `}>
          <div className={`
            flex-1 flex flex-col min-h-0
            ${hasRightPanel ? '' : 'max-w-[720px] mx-auto w-full'}
          `}>
            {/* Task input */}
            <div className={`px-4 py-4 ${!hasRightPanel ? 'px-6 py-6 border-b border-inbox-divider' : ''}`}>
              <TaskInput onAddTask={handleAddTask} />
            </div>

            {/* Back button for completed/someday/insights sub-views */}
            {(viewMode === 'completed' || viewMode === 'someday' || viewMode === 'insights') && (
              <div className={`${hasRightPanel ? 'px-4 pb-3' : 'px-6 pb-4'}`}>
                <button
                  onClick={() => setViewMode('active')}
                  className="flex items-center gap-1 text-sm text-inbox-text-secondary hover:text-inbox-text-primary transition-colors"
                >
                  <MaterialIcon name="arrow_back" size={16} />
                  {viewMode === 'completed' ? 'Completed tasks' : viewMode === 'someday' ? 'Someday tasks' : 'Briefing'}
                </button>
              </div>
            )}

            {/* Content area: Task list or InsightView */}
            <div className="flex-1 overflow-y-auto">
              {viewMode === 'insights' ? (
                <InsightView
                  onClose={() => setViewMode('active')}
                  onActionClick={handleInsightActionClick}
                  scan={scan}
                  selectedActionId={activeInsightActionId}
                />
              ) : (
                <>
                  {viewMode === 'active' && (
                    <div className={`${hasRightPanel ? 'px-0' : 'px-0'}`}>
                      <InsightBriefingCard
                        scan={scan}
                        onClick={() => {
                          handleViewChange('insights');
                          setInsightSelected(true);
                          if (scan.phase === 'idle') scan.startScan(false);
                        }}
                      />
                    </div>
                  )}

                  <TaskList
                    tasks={currentTasks}
                    onComplete={completeTask}
                    onSomeday={somedayTask}
                    onDelete={deleteTask}
                    onRestore={restoreTask}
                    onShowDetails={handleShowDetails}
                    onReorder={reorderTasks}
                    onTogglePin={togglePin}
                    selectedTaskId={selectedTaskId}
                    compact={hasRightPanel}
                  />

                  {currentTasks.length === 0 && !isLoading && (
                    <EmptyState viewMode={viewMode} compact={hasRightPanel} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - ConversationPanel for tasks/meetings, InsightDetailPanel for emails */}
        {hasRightPanel && (
          <div className="flex-1 min-w-0 h-full overflow-hidden bg-inbox-bg-primary">
            {selectedInsightAction && selectedInsightAction.type !== 'meeting_prep' ? (
              <InsightDetailPanel
                action={selectedInsightAction}
                actionState={scan.getActionState(selectedInsightAction.id)}
                onExecute={handleEmailExecute}
                onDismiss={scan.dismissAction}
                onClose={viewMode === 'insights' ? handleCloseRightPanelInInsight : handleClosePanel}
                getEmailContent={scan.getEmailContent}
                onChatUpdate={scan.updateActionChatMessages}
              />
            ) : selectedTask ? (
              <ConversationPanel
                task={selectedTask}
                onClose={viewMode === 'insights' ? handleCloseRightPanelInInsight : handleClosePanel}
                onAddChatMessage={addChatMessage}
                onComplete={completeTask}
                onSomeday={somedayTask}
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
