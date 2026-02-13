'use client';

/**
 * OfferBundle Component - CEO Briefing Style
 *
 * Compact collapsible bundle with:
 * - Smaller icon, tighter spacing
 * - "Draft all" batch action in header
 * - Flat dividers, minimal visual chrome
 */

import { useState, useCallback } from 'react';
import type { ActionBundle } from '@/lib/scan/types';
import OfferItem from './OfferItem';

interface OfferBundleProps {
  bundle: ActionBundle;
  onExecute: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onDismiss: (actionId: string) => Promise<boolean>;
  onAddToTasks?: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
}

export default function OfferBundle({ bundle, onExecute, onDismiss, onAddToTasks }: OfferBundleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDraftingAll, setIsDraftingAll] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Batch action: draft all items
  const handleDraftAll = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle expansion
    setIsDraftingAll(true);

    // Execute all items sequentially
    for (const item of bundle.items) {
      await onExecute(item.id);
    }

    setIsDraftingAll(false);
  }, [bundle.items, onExecute]);

  const remainingItems = bundle.items;

  if (remainingItems.length === 0) {
    return null;
  }

  // Single item: show expanded by default, hide batch action
  const showBatchAction = remainingItems.length > 1;
  const defaultExpanded = remainingItems.length === 1;

  return (
    <div className="border border-black/[0.08] rounded-xl overflow-hidden bg-white">
      {/* Bundle Header - Compact */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors text-left"
      >
        {/* Compact icon */}
        <div className="w-8 h-8 rounded-full bg-inbox-bg-secondary flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-rounded text-lg text-inbox-text-tertiary">
            {bundle.icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-inbox-text-primary leading-tight">
            {bundle.headline}
          </p>
          <p className="text-[13px] text-inbox-text-tertiary leading-tight">
            {bundle.valueProposition}
          </p>
        </div>

        {/* Batch action */}
        {showBatchAction && (
          <button
            onClick={handleDraftAll}
            disabled={isDraftingAll}
            className="px-3 py-1.5 text-[13px] font-medium text-inbox-accent hover:bg-inbox-accent-light rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {isDraftingAll ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-inbox-accent border-t-transparent rounded-full animate-spin" />
                <span>Drafting...</span>
              </span>
            ) : (
              'Draft all'
            )}
          </button>
        )}

        {/* Chevron */}
        <span className={`
          material-symbols-rounded text-inbox-text-tertiary text-xl flex-shrink-0
          transition-transform duration-200
          ${(isExpanded || defaultExpanded) ? 'rotate-180' : ''}
        `}>
          expand_more
        </span>
      </button>

      {/* Expanded Items */}
      {(isExpanded || defaultExpanded) && (
        <div className="border-t border-black/[0.06]">
          {remainingItems.map((item) => (
            <OfferItem
              key={item.id}
              action={item}
              onExecute={onExecute}
              onDismiss={onDismiss}
              onAddToTasks={onAddToTasks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
