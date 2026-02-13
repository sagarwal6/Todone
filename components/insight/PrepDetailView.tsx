'use client';

/**
 * PrepDetailView Component
 *
 * Shows meeting prep summary, replacing the Proactive todos list (Option C design).
 * Follows the same navigation pattern as clicking a task.
 *
 * - "← Proactive todos" navigates back to the list
 * - "Open full task" switches to ConversationPanel
 */

import type { Task } from '@/lib/types';
import { QuickReferenceCard } from '@/components/QuickReferenceCard';
import { Markdown } from '@/components/ui/Markdown';

interface PrepDetailViewProps {
  task: Task;
  onBack: () => void;
  onOpenFullTask: () => void;
}

export default function PrepDetailView({
  task,
  onBack,
  onOpenFullTask,
}: PrepDetailViewProps) {
  // Get the latest assistant message as the prep summary
  const agentMessages = task.chatMessages?.filter(m => m.role === 'assistant') || [];
  const prepSummary = agentMessages[agentMessages.length - 1]?.content || null;

  return (
    <div className="h-full flex flex-col bg-inbox-bg-primary animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-inbox-divider flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-inbox-accent hover:bg-inbox-bg-hover rounded-full px-2 py-1.5 -ml-2 transition-colors"
        >
          <span className="material-symbols-rounded text-lg">arrow_back</span>
          <span className="text-inbox-body font-medium">Proactive todos</span>
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-inbox-body font-medium text-inbox-text-primary truncate">
            Meeting Prep
          </h2>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-5">
          {/* Meeting title */}
          <h1 className="text-inbox-headline text-inbox-text-primary font-medium mb-4">
            {task.title}
          </h1>

          {/* Agent summary */}
          {prepSummary ? (
            <div className="mb-6">
              <div className="prose prose-sm max-w-none text-inbox-body text-inbox-text-secondary leading-relaxed">
                <Markdown content={prepSummary} />
              </div>
            </div>
          ) : task.status === 'researching' ? (
            <div className="flex items-center gap-2 py-8 text-inbox-text-tertiary">
              <span className="material-symbols-rounded text-lg animate-spin">progress_activity</span>
              <span className="text-inbox-body">Preparing...</span>
            </div>
          ) : (
            <p className="text-inbox-body text-inbox-text-tertiary py-4">
              No prep summary available yet.
            </p>
          )}

          {/* Quick Reference Card */}
          {task.agentQuickInfo && (
            <div className="mt-6">
              <QuickReferenceCard quickInfo={task.agentQuickInfo} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-inbox-divider flex-shrink-0 pb-safe-bottom">
        <button
          onClick={onOpenFullTask}
          className="w-full max-w-sm mx-auto block px-4 py-3 text-inbox-body font-medium text-white bg-inbox-accent hover:bg-inbox-accent-hover rounded-xl transition-colors"
        >
          Open full task
        </button>
      </div>
    </div>
  );
}
