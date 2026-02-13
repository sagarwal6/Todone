'use client';

/**
 * QuickWinCard Component - CEO Briefing Style
 *
 * Compact featured card for the highest-impact action.
 * Minimal visual chrome, content-forward design.
 * Shows: sender/meeting info, context, suggested direction.
 */

import { useState, useCallback } from 'react';
import type { InsightAction, DraftResponseContext, MeetingPrepContext } from '@/lib/scan/types';

interface QuickWinCardProps {
  action: InsightAction;
  onExecute: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onSkip: (actionId: string) => Promise<boolean>;
  onAddToTasks?: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
}

/**
 * Extract display info from action context
 */
function getDisplayInfo(action: InsightAction): {
  senderName: string;
  senderInitial: string;
  subject: string;
  timeAgo: string;
  suggestion: string;
} {
  const ctx = action.context || {};

  if (action.type === 'draft_response') {
    const emailCtx = ctx as DraftResponseContext;
    const senderName = emailCtx.senderName || 'Unknown';
    const daysAgo = emailCtx.daysAgo;
    const timeAgo = daysAgo !== undefined
      ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`)
      : '';

    return {
      senderName,
      senderInitial: senderName.charAt(0).toUpperCase(),
      subject: emailCtx.subject || action.detail || 'No subject',
      timeAgo,
      suggestion: emailCtx.suggestedDirection || action.valueProposition || '',
    };
  }

  if (action.type === 'meeting_prep') {
    const meetingCtx = ctx as MeetingPrepContext;
    const title = meetingCtx.title || action.headline;
    const attendee = meetingCtx.keyAttendee || (meetingCtx.attendees?.[0]) || 'Meeting';
    const start = meetingCtx.start ? new Date(meetingCtx.start) : null;
    const timeAgo = start ? start.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }) : '';

    return {
      senderName: attendee.split(' ')[0],
      senderInitial: attendee.charAt(0).toUpperCase(),
      subject: title,
      timeAgo,
      suggestion: meetingCtx.suggestedFocus || action.valueProposition || '',
    };
  }

  // Fallback
  const headline = action.headline || '';
  return {
    senderName: headline.split(' · ')[0] || 'Item',
    senderInitial: headline.charAt(0).toUpperCase() || '?',
    subject: action.detail || '',
    timeAgo: headline.split(' · ')[1] || '',
    suggestion: action.valueProposition || '',
  };
}

export default function QuickWinCard({ action, onExecute, onSkip, onAddToTasks }: QuickWinCardProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isAddingToTasks, setIsAddingToTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { senderName, senderInitial, subject, timeAgo, suggestion } = getDisplayInfo(action);

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);

    try {
      const result = await onExecute(action.id);
      if (!result.success) {
        setError(result.error || 'Failed');
        setIsExecuting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsExecuting(false);
    }
  }, [action.id, onExecute]);

  const handleSkip = useCallback(async () => {
    setIsSkipping(true);
    await onSkip(action.id);
  }, [action.id, onSkip]);

  const handleAddToTasks = useCallback(async () => {
    if (!onAddToTasks) return;

    setIsAddingToTasks(true);
    setError(null);

    try {
      const result = await onAddToTasks(action.id);
      if (!result.success) {
        setError(result.error || 'Failed to add to tasks');
        setIsAddingToTasks(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to tasks');
      setIsAddingToTasks(false);
    }
  }, [action.id, onAddToTasks]);

  if (isSkipping || isAddingToTasks) {
    return null;
  }

  return (
    <div className="border border-inbox-accent/30 rounded-xl overflow-hidden bg-inbox-accent-light/30">
      {/* Compact Header */}
      <div className="px-4 py-2 border-b border-inbox-accent/10 flex items-center gap-2">
        <span className="material-symbols-rounded text-inbox-accent text-sm">bolt</span>
        <span className="text-xs font-semibold text-inbox-accent uppercase tracking-wide">
          Priority
        </span>
      </div>

      {/* Content Row */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-inbox-accent/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-semibold text-inbox-accent">
            {senderInitial}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Primary row */}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-inbox-text-primary flex-shrink-0 max-w-[140px] truncate">
              {senderName}
            </span>
            <span className="text-sm text-inbox-text-secondary flex-1 truncate">
              {subject}
            </span>
            {timeAgo && (
              <span className="text-xs text-inbox-text-tertiary flex-shrink-0">
                {timeAgo}
              </span>
            )}
          </div>

          {/* Suggestion */}
          {suggestion && (
            <div className="flex items-center gap-1 mt-1 text-[13px] text-inbox-accent">
              <span className="material-symbols-rounded text-sm">subdirectory_arrow_right</span>
              <span className="truncate">{suggestion}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-inbox-error mt-1">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleExecute}
            disabled={isExecuting || isSkipping}
            className="px-3 py-1.5 bg-inbox-accent text-white rounded-full text-[13px] font-medium hover:bg-inbox-accent-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isExecuting ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Drafting...</span>
              </>
            ) : (
              'Draft'
            )}
          </button>

          {onAddToTasks && (
            <button
              onClick={handleAddToTasks}
              disabled={isExecuting || isSkipping}
              className="w-8 h-8 rounded-full text-inbox-text-tertiary flex items-center justify-center hover:bg-blue-50 hover:text-inbox-accent transition-colors disabled:opacity-50"
              title="Add to task list"
            >
              <span className="material-symbols-rounded text-lg">playlist_add</span>
            </button>
          )}

          <button
            onClick={handleSkip}
            disabled={isExecuting || isSkipping}
            className="w-8 h-8 rounded-full text-inbox-text-tertiary flex items-center justify-center hover:bg-inbox-bg-hover transition-colors disabled:opacity-50"
            title="Skip"
          >
            <span className="material-symbols-rounded text-lg">close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
