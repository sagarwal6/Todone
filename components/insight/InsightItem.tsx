'use client';

/**
 * InsightItem Component - Pure List Row
 *
 * A simple, scannable row for insight items.
 * Click to select and show detail in panel (no inline expansion).
 *
 * Design principles:
 * - Compact, single-line layout
 * - Selection state for highlighting active item
 * - Hover actions for dismiss
 * - Status indicators (spinner for in_progress, checkmark for completed)
 */

import { useState, useCallback } from 'react';
import type { InsightAction, DraftResponseContext, MeetingPrepContext } from '@/lib/scan/types';
import type { LocalActionState } from '@/hooks/useInsightScan';

interface InsightItemProps {
  action: InsightAction;
  actionState?: LocalActionState | null;
  isPriority?: boolean;
  isSelected?: boolean;
  onSelect: (actionId: string) => void;
  onDismiss: (actionId: string) => Promise<boolean>;
  onViewPrep?: (meetingTitle: string) => void;
}

/**
 * Get sender initial for avatar
 */
function getSenderInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

/**
 * Get a consistent color for sender avatar based on name
 */
function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-rose-500',
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

/**
 * Extract display info from action context
 */
function getDisplayInfo(action: InsightAction): {
  senderName: string;
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
      subject: title,
      timeAgo,
      suggestion: meetingCtx.suggestedFocus || action.valueProposition || '',
    };
  }

  // Fallback
  const headline = action.headline || '';
  return {
    senderName: headline.split(' · ')[0] || 'Item',
    subject: action.detail || '',
    timeAgo: headline.split(' · ')[1] || '',
    suggestion: action.valueProposition || '',
  };
}

export default function InsightItem({
  action,
  actionState,
  isPriority,
  isSelected,
  onSelect,
  onDismiss,
  onViewPrep,
}: InsightItemProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  // Check if this is an already-prepped meeting
  const meetingContext = action.type === 'meeting_prep' ? action.context as MeetingPrepContext : null;
  const isAlreadyPrepped = meetingContext?.alreadyPrepped ?? false;

  // Derive status from actionState
  const isInProgress = actionState?.status === 'in_progress';
  const isCompleted = actionState?.status === 'completed';

  const { senderName, subject, timeAgo, suggestion } = getDisplayInfo(action);

  // Handle row click - select or view prep
  const handleRowClick = useCallback(() => {
    // If already prepped, navigate to the task
    if (isAlreadyPrepped && meetingContext?.title && onViewPrep) {
      onViewPrep(meetingContext.title);
      return;
    }

    // Otherwise, select this item to show in panel
    onSelect(action.id);
  }, [isAlreadyPrepped, meetingContext?.title, onViewPrep, onSelect, action.id]);

  const handleDismiss = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    setIsDismissing(true);
    await onDismiss(action.id);
  }, [action.id, onDismiss]);

  if (isDismissing) {
    return null;
  }

  // Determine action hint based on type and status
  const actionHint = isCompleted
    ? (action.type === 'meeting_prep' ? 'View prep' : 'View draft')
    : action.type === 'draft_response'
      ? 'Draft reply'
      : action.type === 'meeting_prep'
        ? (isAlreadyPrepped ? 'View prep' : 'Prep meeting')
        : '';

  return (
    <div
      onClick={handleRowClick}
      className={`
        group relative flex items-center gap-3 px-4 py-3
        cursor-pointer
        transition-colors duration-100
        border-b border-gray-100 last:border-b-0
        ${isSelected
          ? 'bg-blue-50 border-l-[3px] border-l-inbox-accent'
          : isCompleted
            ? 'bg-green-50/50 hover:bg-green-50'
            : 'hover:bg-gray-50 active:bg-gray-100'
        }
      `}
    >
      {/* Priority indicator (only when not selected and not completed) */}
      {isPriority && !isSelected && !isCompleted && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-inbox-accent" />
      )}

      {/* Status indicator OR Avatar */}
      {isInProgress ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-inbox-accent-light flex-shrink-0">
          <span className="material-symbols-rounded text-lg text-inbox-accent animate-spin">
            progress_activity
          </span>
        </div>
      ) : isCompleted ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-green-100 flex-shrink-0">
          <span className="material-symbols-rounded text-lg text-green-600">
            check_circle
          </span>
        </div>
      ) : (
        <div className={`
          w-9 h-9 rounded-full flex items-center justify-center
          ${getAvatarColor(senderName)} text-white font-medium text-sm
          flex-shrink-0
        `}>
          {getSenderInitial(senderName)}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Primary row */}
        <div className="flex items-baseline gap-2">
          <span className={`
            text-inbox-body truncate
            ${isPriority && !isCompleted ? 'font-semibold' : 'font-medium'}
            ${isCompleted ? 'text-inbox-text-secondary' : 'text-inbox-text-primary'}
          `}>
            {senderName}
          </span>
          <span className={`text-inbox-caption truncate flex-1 ${isCompleted ? 'text-inbox-text-tertiary' : 'text-inbox-text-secondary'}`}>
            {subject}
          </span>
        </div>

        {/* Secondary row - suggestion */}
        {suggestion && !isCompleted && (
          <p className="text-inbox-caption text-inbox-text-secondary truncate mt-0.5">
            {suggestion}
          </p>
        )}

        {/* Status text for in-progress */}
        {isInProgress && (
          <p className="text-inbox-caption text-inbox-accent truncate mt-0.5">
            {action.type === 'meeting_prep' ? 'Preparing...' : 'Drafting...'}
          </p>
        )}

        {/* Status text for completed */}
        {isCompleted && (
          <p className="text-inbox-caption text-green-600 truncate mt-0.5">
            Ready to view
          </p>
        )}
      </div>

      {/* Right side: time + hover action */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {!isInProgress && (
          <span className={`text-inbox-caption ${isCompleted ? 'text-inbox-text-tertiary' : 'text-inbox-text-tertiary'}`}>
            {timeAgo}
          </span>
        )}
        {/* Action hint on hover, chevron when not hovering */}
        {actionHint && !isInProgress && (
          <>
            <span className={`text-inbox-caption hidden group-hover:inline ${isCompleted ? 'text-green-600' : 'text-inbox-accent'}`}>
              {actionHint}
            </span>
            <span className="material-symbols-rounded text-base text-gray-400 group-hover:hidden">
              chevron_right
            </span>
          </>
        )}
      </div>

      {/* Dismiss button - hover only, not for completed items */}
      {!isCompleted && (
        <button
          onClick={handleDismiss}
          className="
            p-1.5 -mr-1 flex-shrink-0
            text-gray-300 hover:text-gray-500
            hover:bg-gray-100 rounded-full
            transition-all
            opacity-0 group-hover:opacity-100
          "
          title="Dismiss"
        >
          <span className="material-symbols-rounded text-lg">close</span>
        </button>
      )}
    </div>
  );
}
