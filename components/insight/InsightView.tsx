'use client';

/**
 * InsightView Component - Pure List
 *
 * Shows Proactive todos list. When an item is clicked,
 * parent handles creating/selecting the task and showing ConversationPanel.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useInsightScan } from '@/hooks/useInsightScan';
import InsightItem from './InsightItem';
import type { InsightAction, MeetingPrepContext } from '@/lib/scan/types';

import type { LocalActionState } from '@/hooks/useInsightScan';

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
  completedAt: number | null;
  startScan: (force?: boolean) => Promise<void>;
  executeAction: (id: string, input?: string, mode?: 'draft' | 'write') => Promise<{ success: boolean; taskId?: string; taskTitle?: string; customPrompt?: string; error?: string }>;
  dismissAction: (id: string) => Promise<boolean>;
  getEmailContent: (id: string) => { id: string; from: string; subject: string; body: string; date: string } | null;
  getActionState: (id: string) => LocalActionState | null;
  setActionResult: (id: string, result: LocalActionState['result']) => void;
  setActionFailed: (id: string, error: string) => void;
  getActionTaskId: (id: string) => string | undefined;
  updateActionChatMessages: (actionId: string, messages: import('@/lib/types').ChatMessage[]) => void;
}

interface InsightViewProps {
  onClose?: () => void;
  onActionClick?: (action: InsightAction) => void;
  scan?: ScanObject;
  selectedActionId?: string | null;
}

export default function InsightView({
  onClose,
  onActionClick,
  scan: externalScan,
  selectedActionId,
}: InsightViewProps) {
  const internalScan = useInsightScan();
  const scan = externalScan || internalScan;

  // Group actions by type (meetings vs emails), filtering out organization suggestions
  const { meetingActions, emailActions } = useMemo(() => {
    const meetings: Array<{ action: InsightAction; isPriority: boolean }> = [];
    const emails: Array<{ action: InsightAction; isPriority: boolean }> = [];

    // Helper to categorize action
    const addAction = (action: InsightAction, isPriority: boolean) => {
      // Skip organization/smart_label actions entirely
      if (action.type === 'smart_label') return;

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

    return { meetingActions: meetings, emailActions: emails };
  }, [scan.quickWin, scan.bundles]);

  const hasContent = meetingActions.length > 0 || emailActions.length > 0;

  // Handle item selection - notify parent
  const handleSelectItem = useCallback((actionId: string) => {
    // Find the action object
    const allActions: InsightAction[] = [];
    if (scan.quickWin) allActions.push(scan.quickWin);
    for (const bundle of scan.bundles) {
      for (const item of bundle.items) {
        allActions.push(item);
      }
    }
    const action = allActions.find(a => a.id === actionId);
    if (action && onActionClick) {
      onActionClick(action);
    }
  }, [onActionClick, scan.quickWin, scan.bundles]);

  // Resolve actionState, falling back to prepped action's state for already-prepped meetings
  const getResolvedActionState = useCallback((action: InsightAction): LocalActionState | null => {
    const state = scan.getActionState(action.id);
    if (state) return state;

    // For already-prepped meetings, fall back to the previous prep's state
    if (action.type === 'meeting_prep') {
      const preppedId = (action.context as MeetingPrepContext)?.preppedActionId;
      if (preppedId) {
        return scan.getActionState(preppedId);
      }
    }
    return null;
  }, [scan]);

  // Auto-start scan when view opens
  useEffect(() => {
    if (scan.phase === 'idle') {
      scan.startScan(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Force refresh handler
  const handleRefresh = () => {
    scan.startScan(true);
  };

  // Render the Proactive todos list
  return (
    <div className="h-full flex flex-col bg-inbox-bg-primary">
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
          <div className="max-w-2xl mx-auto">
            {/* Section Header - "Proactive todos" */}
            <div className="px-3 py-3 flex items-center gap-3">
              <span className="material-symbols-rounded text-inbox-accent text-lg">auto_awesome</span>
              <span className="text-inbox-body font-medium text-inbox-text-primary flex-1">Proactive todos</span>
              {scan.completedAt && (
                <span className="text-[11px] text-inbox-text-tertiary">
                  {formatRelativeTime(scan.completedAt)}
                </span>
              )}
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
                      actionState={getResolvedActionState(action)}
                      isPriority={isPriority}
                      isSelected={action.id === selectedActionId}
                      onSelect={handleSelectItem}
                      onDismiss={scan.dismissAction}
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
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  // Rotating contextual messages during analyzing phase
  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  const analyzingMessages = useMemo(() => {
    const msgs: string[] = [];
    if (emailsScanned > 0) msgs.push(`Reviewing ${emailsScanned} emails...`);
    if (eventsScanned > 0) msgs.push(`Checking ${eventsScanned} calendar events...`);
    msgs.push('Finding emails that need a response...');
    msgs.push('Identifying meetings to prep...');
    msgs.push('Prioritizing what matters most...');
    return msgs;
  }, [emailsScanned, eventsScanned]);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setMessageIndex(prev => (prev + 1) % analyzingMessages.length);
        setFadeIn(true);
      }, 200);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase, analyzingMessages.length]);

  // Time-based progress bar: asymptotic curve that creeps forward smoothly
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (phase !== 'analyzing') { setElapsedMs(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, [phase]);

  // Scanning: 30%, Analyzing: 35% → creeps to ~60% over 10s (asymptotic, never finishes)
  const progressPct = phase === 'analyzing'
    ? 35 + 25 * (1 - Math.exp(-elapsedMs / 8000))
    : 30;

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

      <p className={`text-sm text-inbox-text-tertiary mb-4 text-center transition-opacity duration-200 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
        {phase === 'scanning' ? (
          <>
            {emailsScanned > 0 && `${emailsScanned} emails`}
            {emailsScanned > 0 && eventsScanned > 0 && ' · '}
            {eventsScanned > 0 && `${eventsScanned} events`}
            {emailsScanned === 0 && eventsScanned === 0 && 'Getting started'}
          </>
        ) : (
          analyzingMessages[messageIndex]
        )}
      </p>

      <div className="w-40 h-1 bg-inbox-bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-inbox-accent rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progressPct}%` }}
        />
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
