'use client';

/**
 * OfferItem Component - CEO Briefing Style
 *
 * Compact, scannable email row with:
 * - Sender avatar (initial)
 * - Single line: Sender + Subject + Time
 * - Subtle AI suggestion (secondary, not hero)
 * - Actions on hover (desktop), always visible (mobile)
 */

import { useState, useCallback } from 'react';
import type { InsightAction, DraftResponseContext, MeetingPrepContext } from '@/lib/scan/types';

interface OfferItemProps {
  action: InsightAction;
  onExecute: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onDismiss: (actionId: string) => Promise<boolean>;
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
      senderName: attendee.split(' ')[0], // First name only
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

export default function OfferItem({ action, onExecute, onDismiss, onAddToTasks }: OfferItemProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
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

  const handleDismiss = useCallback(async () => {
    setIsDismissing(true);
    await onDismiss(action.id);
  }, [action.id, onDismiss]);

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

  if (isDismissing || isAddingToTasks) {
    return null;
  }

  return (
    <div
      className={`
        group relative flex items-start gap-3 px-4 py-2.5
        hover:bg-black/[0.02] transition-colors
        border-b border-black/[0.06] last:border-b-0
        ${isDismissing ? 'opacity-50' : ''}
      `}
    >
      {/* Sender Avatar */}
      <div className="w-7 h-7 rounded-full bg-inbox-bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-semibold text-inbox-text-tertiary">
          {senderInitial}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Primary row: Sender + Subject + Time */}
        <div className="flex items-baseline gap-2 pr-20 md:pr-24">
          <span className="text-[13px] font-semibold text-inbox-text-primary flex-shrink-0 max-w-[120px] truncate">
            {senderName}
          </span>
          <span className="text-[13px] text-inbox-text-secondary flex-1 truncate">
            {subject}
          </span>
          {timeAgo && (
            <span className="text-xs text-inbox-text-tertiary flex-shrink-0">
              {timeAgo}
            </span>
          )}
        </div>

        {/* AI Suggestion - subtle secondary row */}
        {suggestion && (
          <div className="flex items-center gap-1 text-xs text-inbox-text-tertiary pr-20">
            <span className="material-symbols-rounded text-sm opacity-50">
              subdirectory_arrow_right
            </span>
            <span className="truncate">{suggestion}</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-xs text-inbox-error mt-0.5">{error}</p>
        )}
      </div>

      {/* Hover Actions (Desktop) - hidden by default, shown on hover */}
      <div className={`
        absolute right-3 top-1/2 -translate-y-1/2
        hidden md:flex items-center gap-1
        opacity-0 group-hover:opacity-100
        transition-opacity duration-150
        bg-gradient-to-l from-white via-white to-transparent pl-6
      `}>
        <button
          onClick={handleExecute}
          disabled={isExecuting || isDismissing}
          className="w-8 h-8 rounded-full bg-inbox-accent text-white flex items-center justify-center hover:bg-inbox-accent-hover transition-colors disabled:opacity-50"
          title="Draft reply"
        >
          {isExecuting ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-rounded text-lg">edit</span>
          )}
        </button>

        {onAddToTasks && (
          <button
            onClick={handleAddToTasks}
            disabled={isExecuting || isDismissing}
            className="w-8 h-8 rounded-full text-inbox-text-tertiary flex items-center justify-center hover:bg-blue-50 hover:text-inbox-accent transition-colors disabled:opacity-50"
            title="Add to task list"
          >
            <span className="material-symbols-rounded text-lg">playlist_add</span>
          </button>
        )}

        <button
          onClick={handleDismiss}
          disabled={isExecuting || isDismissing}
          className="w-8 h-8 rounded-full text-inbox-text-tertiary flex items-center justify-center hover:bg-inbox-bg-hover transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          <span className="material-symbols-rounded text-lg">close</span>
        </button>
      </div>

      {/* Mobile: Always visible action */}
      <div className="md:hidden flex items-center flex-shrink-0">
        <button
          onClick={handleExecute}
          disabled={isExecuting || isDismissing}
          className="w-9 h-9 rounded-full bg-inbox-accent text-white flex items-center justify-center disabled:opacity-50"
        >
          {isExecuting ? (
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-rounded text-base">edit</span>
          )}
        </button>
      </div>
    </div>
  );
}
