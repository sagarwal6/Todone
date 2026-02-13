'use client';

/**
 * InsightView Component - Split Panel Layout
 *
 * Shows Proactive todos list. When an item is selected, splits into:
 * - Left: Proactive todos list (narrower)
 * - Right: Detail panel
 *
 * On narrow screens, detail takes over.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useInsightScan } from '@/hooks/useInsightScan';
import InsightItem from './InsightItem';
import InsightDetailPanel from './InsightDetailPanel';
import PrepDetailView from './PrepDetailView';
import type { InsightAction } from '@/lib/scan/types';
import type { Task } from '@/lib/types';

// Sub-view state for InsightView
type InsightSubView =
  | { type: 'list' }
  | { type: 'prep'; task: Task };

import type { LocalActionState } from '@/hooks/useInsightScan';
import type { AgentQuickInfo } from '@/lib/types';

// Type for the scan object from useInsightScan
export interface ScanObject {
  phase: 'idle' | 'scanning' | 'analyzing' | 'complete' | 'error';
  portrait: import('@/lib/scan/types').InsightPortrait | null;
  greeting: string | null;
  quickWin: InsightAction | null;
  bundles: import('@/lib/scan/types').ActionBundle[];
  error: string | null;
  emailsScanned: number;
  eventsScanned: number;
  actionStates: Record<string, LocalActionState>;
  startScan: (force?: boolean) => Promise<void>;
  executeAction: (id: string, input?: string, mode?: 'draft' | 'write') => Promise<{ success: boolean; taskId?: string; taskTitle?: string; customPrompt?: string; error?: string }>;
  dismissAction: (id: string) => Promise<boolean>;
  getEmailContent: (id: string) => { id: string; from: string; subject: string; body: string; date: string } | null;
  getActionState: (id: string) => LocalActionState | null;
  setActionResult: (id: string, result: LocalActionState['result']) => void;
  setActionFailed: (id: string, error: string) => void;
  getActionTaskId: (id: string) => string | undefined;
}

interface InsightViewProps {
  onClose?: () => void;
  onCreateTask?: (title: string, customPrompt?: string, actionId?: string) => void;
  onSelectTask?: (meetingTitle: string) => void;
  tasks?: Task[];
  // External control of selection (for 3-pane layout)
  selectedActionId?: string | null;
  onSelectAction?: (actionId: string | null) => void;
  // If true, don't render detail panel (parent will render it)
  externalDetail?: boolean;
  // External scan object (if provided, InsightView won't create its own)
  scan?: ScanObject;
}

export default function InsightView({
  onClose,
  onCreateTask,
  onSelectTask,
  tasks = [],
  selectedActionId: externalSelectedId,
  onSelectAction,
  externalDetail = false,
  scan: externalScan,
}: InsightViewProps) {
  const internalScan = useInsightScan();
  const scan = externalScan || internalScan;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width for responsive behavior
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Sub-view state: list (default) or prep detail
  const [subView, setSubView] = useState<InsightSubView>({ type: 'list' });

  // Selected action ID for detail panel - use external if provided, otherwise internal
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedActionId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
  const setSelectedActionId = onSelectAction || setInternalSelectedId;

  // Determine if we have enough space for split view (list + detail)
  // When externalDetail is true, we never show detail internally
  const canShowSplitView = !externalDetail && containerWidth >= 600;

  // Group actions by type (meetings vs emails), filtering out organization suggestions
  const { meetingActions, emailActions, allActions } = useMemo(() => {
    const meetings: Array<{ action: InsightAction; isPriority: boolean }> = [];
    const emails: Array<{ action: InsightAction; isPriority: boolean }> = [];
    const all: InsightAction[] = [];

    // Helper to categorize action
    const addAction = (action: InsightAction, isPriority: boolean) => {
      // Skip organization/smart_label actions entirely
      if (action.type === 'smart_label') return;

      all.push(action);

      if (action.type === 'meeting_prep') {
        meetings.push({ action, isPriority });
      } else if (action.type === 'draft_response' || action.type === 'follow_up') {
        emails.push({ action, isPriority });
      }
    };

    // Quick win is priority
    if (scan.quickWin) {
      addAction(scan.quickWin, true);
    }

    // All bundle items
    for (const bundle of scan.bundles) {
      for (const item of bundle.items) {
        addAction(item, false);
      }
    }

    // Sort emails by recency (most recent first = lowest daysAgo first)
    emails.sort((a, b) => {
      const aDaysAgo = (a.action.context as { daysAgo?: number })?.daysAgo ?? 999;
      const bDaysAgo = (b.action.context as { daysAgo?: number })?.daysAgo ?? 999;
      return aDaysAgo - bDaysAgo;
    });

    // Sort meetings by start time (soonest first)
    meetings.sort((a, b) => {
      const aStart = (a.action.context as { start?: string })?.start;
      const bStart = (b.action.context as { start?: string })?.start;
      if (!aStart && !bStart) return 0;
      if (!aStart) return 1;
      if (!bStart) return -1;
      return new Date(aStart).getTime() - new Date(bStart).getTime();
    });

    return { meetingActions: meetings, emailActions: emails, allActions: all };
  }, [scan.quickWin, scan.bundles]);

  // Find selected action
  const selectedAction = useMemo(() => {
    if (!selectedActionId) return null;
    return allActions.find(a => a.id === selectedActionId) || null;
  }, [selectedActionId, allActions]);

  // NOTE: Removed auto-close effect. Panel now stays open during and after execution.
  // Action status is tracked in actionStates, not by removal from list.

  const hasContent = meetingActions.length > 0 || emailActions.length > 0;

  // Wrapper to handle action execution and task creation
  const handleExecuteAction = async (actionId: string, userInput?: string, replyMode?: 'draft' | 'write') => {
    const result = await scan.executeAction(actionId, userInput, replyMode);
    if (result.success && result.taskTitle && onCreateTask) {
      // Pass actionId so parent can track mapping
      onCreateTask(result.taskTitle, result.customPrompt, actionId);
    }
    return result;
  };

  // Handle viewing an already-prepped meeting - switch to prep detail view
  const handleViewPrep = useCallback((meetingTitle: string) => {
    // Find the task by matching title pattern "Prepare for: {meetingTitle}"
    const matchingTask = tasks.find(t =>
      t.title === `Prepare for: ${meetingTitle}` ||
      t.title.includes(meetingTitle)
    );
    if (matchingTask) {
      setSubView({ type: 'prep', task: matchingTask });
    }
  }, [tasks]);

  // Handle going back to list from prep detail
  const handleBackToList = useCallback(() => {
    setSubView({ type: 'list' });
    setSelectedActionId(null);
  }, []);

  // Handle opening full task from prep detail
  const handleOpenFullTask = useCallback(() => {
    if (subView.type === 'prep' && onSelectTask) {
      onSelectTask(subView.task.title);
    }
  }, [subView, onSelectTask]);

  // Handle item selection - show detail panel
  const handleSelectItem = useCallback((actionId: string) => {
    setSelectedActionId(actionId);
  }, []);

  // Handle panel close
  const handleClosePanel = useCallback(() => {
    setSelectedActionId(null);
  }, []);

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

  // Auto-start scan when view opens
  useEffect(() => {
    if (scan.phase === 'idle') {
      scan.startScan(false, { protectedSenders });
    }
  }, [protectedSenders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force refresh handler
  const handleRefresh = () => {
    scan.startScan(true, { protectedSenders }); // force=true bypasses cache
  };

  // Render prep detail view if selected
  if (subView.type === 'prep') {
    return (
      <PrepDetailView
        task={subView.task}
        onBack={handleBackToList}
        onOpenFullTask={handleOpenFullTask}
      />
    );
  }

  // Determine layout mode
  // When externalDetail is true, we never show detail internally (parent renders it)
  const showDetailPanel = !externalDetail && selectedAction !== null;
  const showListAndDetail = showDetailPanel && canShowSplitView;
  const showDetailOnly = showDetailPanel && !canShowSplitView;

  // Render the Proactive todos list with split panel when item selected
  return (
    <div ref={containerRef} className="h-full flex bg-inbox-bg-primary">
      {/* List column - hide on narrow screens when detail is showing */}
      {(!showDetailOnly) && (
        <div
          className={`
            flex flex-col overflow-hidden border-r border-gray-200
            ${showListAndDetail ? 'w-[320px] flex-shrink-0' : 'flex-1'}
          `}
        >
          {/* Scrollable list content */}
          <div className="flex-1 overflow-y-auto">
            {/* Scanning State */}
            {(scan.phase === 'scanning' || scan.phase === 'analyzing') && (
              <ScanProgress
                phase={scan.phase}
                emailsScanned={scan.emailsScanned}
                eventsScanned={scan.eventsScanned}
              />
            )}

            {/* Error State */}
            {scan.phase === 'error' && (
              <ErrorState
                error={scan.error || 'Something went wrong'}
                onRetry={scan.startScan}
              />
            )}

            {/* Complete State - Grouped by Type */}
            {scan.phase === 'complete' && (
              <div className={showListAndDetail ? '' : 'max-w-2xl mx-auto'}>
                {/* Section Header - "Proactive todos" */}
                <div className="px-3 py-3 flex items-center gap-3">
                  <span className="material-symbols-rounded text-inbox-accent text-lg">auto_awesome</span>
                  <span className="text-inbox-body font-medium text-inbox-text-primary flex-1">Proactive todos</span>
                  <button
                    onClick={handleRefresh}
                    className="p-1 rounded-full hover:bg-inbox-bg-hover transition-colors"
                    title="Refresh"
                  >
                    <span className="material-symbols-rounded text-inbox-text-tertiary text-base">refresh</span>
                  </button>
                </div>

                {/* Greeting - subtle context line */}
                {scan.greeting && (
                  <div className="px-3 pb-3 text-inbox-caption text-inbox-text-tertiary">
                    {scan.greeting}
                  </div>
                )}

                {/* Meetings Section */}
                {meetingActions.length > 0 && (
                  <div>
                    <div className="px-3 py-2 bg-[#E8EAED]">
                      <span className="text-[12px] font-semibold text-[#3C4043] uppercase tracking-wider">
                        Meetings
                      </span>
                    </div>
                    <div className="divide-y divide-inbox-divider">
                      {meetingActions.map(({ action, isPriority }) => (
                        <InsightItem
                          key={action.id}
                          action={action}
                          actionState={scan.getActionState(action.id)}
                          isPriority={isPriority}
                          isSelected={action.id === selectedActionId}
                          onSelect={handleSelectItem}
                          onDismiss={scan.dismissAction}
                          onViewPrep={handleViewPrep}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Emails Section */}
                {emailActions.length > 0 && (
                  <div>
                    <div className="px-3 py-2 bg-[#E8EAED]">
                      <span className="text-[12px] font-semibold text-[#3C4043] uppercase tracking-wider">
                        Emails
                      </span>
                    </div>
                    <div className="divide-y divide-inbox-divider">
                      {emailActions.map(({ action, isPriority }) => (
                        <InsightItem
                          key={action.id}
                          action={action}
                          actionState={scan.getActionState(action.id)}
                          isPriority={isPriority}
                          isSelected={action.id === selectedActionId}
                          onSelect={handleSelectItem}
                          onDismiss={scan.dismissAction}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!hasContent && <EmptyState onRetry={scan.startScan} />}
              </div>
            )}

            {/* Idle State */}
            {scan.phase === 'idle' && (
              <IdleState onStartScan={scan.startScan} />
            )}
          </div>
        </div>
      )}

      {/* Detail panel - appears alongside list on wide screens, replaces on narrow */}
      {showDetailPanel && selectedAction && (
        <div className="flex-1 min-w-0">
          <InsightDetailPanel
            action={selectedAction}
            actionState={scan.getActionState(selectedAction.id)}
            onExecute={handleExecuteAction}
            onDismiss={scan.dismissAction}
            onClose={handleClosePanel}
            getEmailContent={scan.getEmailContent}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components (simplified)
// ============================================================================

function ScanProgress({
  phase,
  emailsScanned,
  eventsScanned,
}: {
  phase: 'scanning' | 'analyzing';
  emailsScanned: number;
  eventsScanned: number;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[300px]">
      <div className="w-12 h-12 mb-4 rounded-full bg-inbox-accent-light flex items-center justify-center">
        <span className="material-symbols-rounded text-xl text-inbox-accent animate-pulse">
          {phase === 'scanning' ? 'mail' : 'psychology'}
        </span>
      </div>

      <p className="text-[15px] text-inbox-text-primary mb-1">
        {phase === 'scanning' ? 'Scanning...' : 'Analyzing...'}
      </p>

      <p className="text-sm text-inbox-text-tertiary mb-4">
        {phase === 'scanning' ? (
          <>
            {emailsScanned > 0 && `${emailsScanned} emails`}
            {emailsScanned > 0 && eventsScanned > 0 && ' · '}
            {eventsScanned > 0 && `${eventsScanned} events`}
            {emailsScanned === 0 && eventsScanned === 0 && 'Getting started'}
          </>
        ) : (
          'Finding actionable items'
        )}
      </p>

      <div className="w-40 h-1 bg-inbox-bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-inbox-accent rounded-full animate-[insight-progress_15s_ease-out_forwards]" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[250px]">
      <div className="w-12 h-12 mb-3 rounded-full bg-red-50 flex items-center justify-center">
        <span className="material-symbols-rounded text-xl text-inbox-error">error</span>
      </div>
      <p className="text-[15px] text-inbox-text-primary mb-1">Couldn&apos;t complete scan</p>
      <p className="text-sm text-inbox-text-tertiary mb-4 text-center max-w-sm">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-inbox-accent text-white rounded-full text-sm font-medium hover:bg-inbox-accent-hover transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 min-h-[200px]">
      <div className="w-12 h-12 mb-3 rounded-full bg-green-50 flex items-center justify-center">
        <span className="material-symbols-rounded text-xl text-inbox-success">check_circle</span>
      </div>
      <p className="text-[15px] text-inbox-text-primary mb-1">All caught up</p>
      <p className="text-sm text-inbox-text-tertiary mb-4 text-center">Nothing urgent right now</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-inbox-bg-secondary text-inbox-text-secondary rounded-full text-sm font-medium hover:bg-inbox-bg-hover transition-colors"
      >
        Scan again
      </button>
    </div>
  );
}

function IdleState({ onStartScan }: { onStartScan: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[250px]">
      <div className="w-12 h-12 mb-4 rounded-full bg-inbox-accent-light flex items-center justify-center">
        <span className="material-symbols-rounded text-xl text-inbox-accent">auto_awesome</span>
      </div>
      <p className="text-[15px] text-inbox-text-primary mb-1">See how I can help</p>
      <p className="text-sm text-inbox-text-tertiary mb-4 text-center max-w-sm">
        I&apos;ll scan your inbox and calendar
      </p>
      <button
        onClick={onStartScan}
        className="px-4 py-2 bg-inbox-accent text-white rounded-full text-sm font-medium hover:bg-inbox-accent-hover transition-colors"
      >
        Start scan
      </button>
    </div>
  );
}
