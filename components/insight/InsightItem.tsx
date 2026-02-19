'use client';

/**
 * InsightItem Component - Clean List Row
 *
 * Compact, scannable row with small colored avatar for warmth.
 * Status communicated via avatar replacement (spinner/checkmark).
 * Single-line sender + subject, optional suggestion second line.
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
}

function getSenderInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-rose-500',
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

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
}: InsightItemProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  const isInProgress = actionState?.status === 'in_progress';
  const isCompleted = actionState?.status === 'completed';

  const { senderName, subject, timeAgo, suggestion } = getDisplayInfo(action);

  const handleRowClick = useCallback(() => {
    onSelect(action.id);
  }, [onSelect, action.id]);

  const handleDismiss = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissing(true);
    await onDismiss(action.id);
  }, [action.id, onDismiss]);

  if (isDismissing) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleRowClick}
      className={`
        group relative w-full flex items-center gap-3 px-4 py-3
        text-left cursor-pointer
        transition-colors duration-100
        ${isSelected
          ? 'bg-blue-50'
          : isCompleted
            ? 'hover:bg-gray-50 active:bg-gray-100'
            : 'hover:bg-gray-50 active:bg-gray-100'
        }
      `}
    >
      {/* Priority accent bar */}
      {isPriority && !isSelected && !isCompleted && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-inbox-accent rounded-full" />
      )}

      {/* Avatar / Status indicator — 32px circle */}
      {isInProgress ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50 flex-shrink-0">
          <span className="material-symbols-rounded text-[18px] text-inbox-accent animate-spin">
            progress_activity
          </span>
        </div>
      ) : isCompleted ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50 flex-shrink-0">
          <span className="material-symbols-rounded text-[18px] text-green-600">
            check_circle
          </span>
        </div>
      ) : (
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center
          ${getAvatarColor(senderName)} text-white text-xs font-medium
          flex-shrink-0
        `}>
          {getSenderInitial(senderName)}
        </div>
      )}

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isCompleted ? 'opacity-60' : ''}`}>
        {/* Primary line: sender + subject */}
        <p className="truncate text-[14px] leading-[20px]">
          <span className={`${isPriority && !isCompleted ? 'font-semibold' : 'font-medium'} text-inbox-text-primary`}>
            {senderName}
          </span>
          <span className="text-inbox-text-tertiary">{' '}&middot;{' '}</span>
          <span className="font-normal text-inbox-text-secondary">
            {subject}
          </span>
        </p>

        {/* Suggestion line */}
        {suggestion && !isCompleted && !isInProgress && (
          <p className="text-[13px] leading-[18px] text-inbox-text-tertiary truncate mt-0.5">
            {suggestion}
          </p>
        )}

        {/* In-progress hint */}
        {isInProgress && (
          <p className="text-[13px] leading-[18px] text-inbox-accent truncate mt-0.5">
            {action.type === 'meeting_prep' ? 'Preparing...' : 'Drafting...'}
          </p>
        )}

        {/* Completed hint */}
        {isCompleted && (
          <p className="text-[13px] leading-[18px] text-green-600 truncate mt-0.5">
            Ready to view
          </p>
        )}
      </div>

      {/* Right: time */}
      <span className="flex-shrink-0 text-[12px] leading-[16px] text-inbox-text-tertiary whitespace-nowrap">
        {timeAgo}
      </span>

      {/* Dismiss — hover only on desktop */}
      {!isInProgress && (
        <span
          role="button"
          tabIndex={-1}
          onClick={handleDismiss}
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            p-1.5 rounded-full
            text-gray-300 hover:text-gray-500 hover:bg-gray-100
            transition-opacity duration-150
            opacity-0 group-hover:opacity-100
            pointer-events-none group-hover:pointer-events-auto
          "
          aria-label="Dismiss"
        >
          <span className="material-symbols-rounded text-[16px]">close</span>
        </span>
      )}
    </button>
  );
}
