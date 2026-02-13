'use client';

/**
 * PendingDrafts Component
 *
 * Displays all pending drafts for a task and handles the confirmation flow.
 * Supports multiple pending drafts (email + calendar).
 */

import { useState, useCallback } from 'react';
import { EmailDraftCard } from './EmailDraftCard';
import { CalendarDraftCard } from './CalendarDraftCard';
import type {
  PendingDraft,
  EmailDraft,
  CalendarEventDraft,
  ConfirmationResult,
} from '@/lib/ai/types';

interface PendingDraftsProps {
  taskId: string;
  drafts: PendingDraft[];
  onDraftConfirmed?: (draftId: string, result: ConfirmationResult) => void;
  onDraftRejected?: (draftId: string) => void;
  onAllDraftsProcessed?: () => void;
}

export function PendingDrafts({
  taskId,
  drafts,
  onDraftConfirmed,
  onDraftRejected,
  onAllDraftsProcessed,
}: PendingDraftsProps) {
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [processedDrafts, setProcessedDrafts] = useState<Set<string>>(new Set());

  const handleConfirm = useCallback(
    async (draftId: string, editedData?: EmailDraft | CalendarEventDraft) => {
      setLoadingDraftId(draftId);

      try {
        const response = await fetch(`/api/tasks/${taskId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId,
            action: editedData ? 'edit' : 'confirm',
            editedData,
          }),
        });

        const result: ConfirmationResult = await response.json();

        if (result.success) {
          setProcessedDrafts((prev) => new Set([...prev, draftId]));
          onDraftConfirmed?.(draftId, result);

          // Check if all drafts are processed
          if (processedDrafts.size + 1 === drafts.length) {
            onAllDraftsProcessed?.();
          }
        } else {
          console.error('Draft confirmation failed:', result.error);
          // Could show an error toast here
        }
      } catch (error) {
        console.error('Failed to confirm draft:', error);
      } finally {
        setLoadingDraftId(null);
      }
    },
    [taskId, drafts.length, processedDrafts.size, onDraftConfirmed, onAllDraftsProcessed]
  );

  const handleReject = useCallback(
    async (draftId: string, feedback?: string) => {
      setLoadingDraftId(draftId);

      try {
        const response = await fetch(`/api/tasks/${taskId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId,
            action: 'reject',
            feedback,
          }),
        });

        const result: ConfirmationResult = await response.json();

        if (result.success) {
          setProcessedDrafts((prev) => new Set([...prev, draftId]));
          onDraftRejected?.(draftId);

          // Check if all drafts are processed
          if (processedDrafts.size + 1 === drafts.length) {
            onAllDraftsProcessed?.();
          }
        }
      } catch (error) {
        console.error('Failed to reject draft:', error);
      } finally {
        setLoadingDraftId(null);
      }
    },
    [taskId, drafts.length, processedDrafts.size, onDraftRejected, onAllDraftsProcessed]
  );

  // Filter out already processed drafts
  const pendingDraftsList = drafts.filter(
    (draft) => !processedDrafts.has(draft.id)
  );

  if (pendingDraftsList.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="material-symbols-rounded text-amber-500">
          pending_actions
        </span>
        <span>
          {pendingDraftsList.length === 1
            ? '1 draft awaiting your review'
            : `${pendingDraftsList.length} drafts awaiting your review`}
        </span>
      </div>

      {/* Draft Cards */}
      <div className="space-y-3">
        {pendingDraftsList.map((draft) => {
          const isLoading = loadingDraftId === draft.id;

          if (draft.type === 'email_draft') {
            return (
              <EmailDraftCard
                key={draft.id}
                draft={draft}
                taskId={taskId}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isLoading={isLoading}
              />
            );
          }

          if (draft.type === 'calendar_event') {
            return (
              <CalendarDraftCard
                key={draft.id}
                draft={draft}
                taskId={taskId}
                onConfirm={handleConfirm}
                onReject={handleReject}
                isLoading={isLoading}
              />
            );
          }

          return null;
        })}
      </div>

      {/* Bulk actions (if multiple drafts) */}
      {pendingDraftsList.length > 1 && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
          <span className="text-xs text-gray-500">Bulk actions:</span>
          <button
            onClick={() => {
              // Could implement bulk confirm here
              console.log('Bulk confirm all');
            }}
            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            Confirm All
          </button>
          <button
            onClick={() => {
              // Could implement bulk reject here
              console.log('Bulk reject all');
            }}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            Reject All
          </button>
        </div>
      )}
    </div>
  );
}

export default PendingDrafts;
