'use client';

/**
 * InsightActionCard Component
 *
 * Displays a single suggested action from the insight scan.
 * Shows action type icon, headline, detail, and execute/dismiss buttons.
 */

import { useState, useCallback } from 'react';
import type { InsightAction } from '@/lib/scan/types';

interface InsightActionCardProps {
  action: InsightAction;
  onExecute: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onDismiss: (actionId: string) => Promise<boolean>;
}

// Action type icons and colors
const actionTypeConfig: Record<InsightAction['type'], { icon: string; color: string; bgColor: string }> = {
  draft_response: {
    icon: 'reply',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  meeting_prep: {
    icon: 'event',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  follow_up: {
    icon: 'forward_to_inbox',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  smart_label: {
    icon: 'label',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
  },
};

// Priority badges
const priorityConfig: Record<InsightAction['priority'], { label: string; className: string }> = {
  high: {
    label: 'Urgent',
    className: 'bg-red-100 text-red-700',
  },
  medium: {
    label: 'Soon',
    className: 'bg-amber-100 text-amber-700',
  },
  low: {
    label: 'Later',
    className: 'bg-gray-100 text-gray-600',
  },
};

export default function InsightActionCard({
  action,
  onExecute,
  onDismiss,
}: InsightActionCardProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeConfig = actionTypeConfig[action.type];
  const priority = priorityConfig[action.priority];

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);

    try {
      const result = await onExecute(action.id);
      if (!result.success) {
        setError(result.error || 'Failed to execute');
        setIsExecuting(false);
      }
      // If successful, the card will be removed from the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsExecuting(false);
    }
  }, [action.id, onExecute]);

  const handleDismiss = useCallback(async () => {
    setIsDismissing(true);
    await onDismiss(action.id);
    // Card will be removed from list
  }, [action.id, onDismiss]);

  return (
    <div className="
      p-3
      bg-white
      border border-inbox-divider
      rounded-xl
      hover:border-inbox-divider-strong
      transition-colors
    ">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className={`
          w-10 h-10 rounded-full flex-shrink-0
          flex items-center justify-center
          ${typeConfig.bgColor}
        `}>
          <span className={`material-symbols-rounded ${typeConfig.color}`}>
            {typeConfig.icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-medium text-inbox-text-primary truncate">
              {action.headline}
            </h3>
            {action.priority !== 'low' && (
              <span className={`
                px-1.5 py-0.5 text-xs font-medium rounded-full flex-shrink-0
                ${priority.className}
              `}>
                {priority.label}
              </span>
            )}
          </div>

          <p className="text-sm text-inbox-text-tertiary line-clamp-2">
            {action.detail}
          </p>

          {error && (
            <p className="mt-1 text-xs text-inbox-error">{error}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 ml-13">
        <button
          onClick={handleExecute}
          disabled={isExecuting || isDismissing}
          className="
            flex items-center gap-1.5
            px-3 py-1.5
            bg-inbox-accent text-white
            rounded-full
            text-sm font-medium
            hover:bg-inbox-accent-hover
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {isExecuting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Working...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-rounded text-base">play_arrow</span>
              <span>Do this</span>
            </>
          )}
        </button>

        <button
          onClick={handleDismiss}
          disabled={isExecuting || isDismissing}
          className="
            px-3 py-1.5
            text-inbox-text-tertiary
            rounded-full
            text-sm
            hover:bg-inbox-bg-hover
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {isDismissing ? 'Dismissing...' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
