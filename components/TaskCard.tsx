'use client';

import { useState, useCallback } from 'react';
import { Task, ProgressStatus, Feedback } from '@/lib/types';
import { ActionButton } from './ActionButton';
import { SourceList } from './SourceBadge';
import { FeedbackWidget } from './FeedbackWidget';
import { ProgressiveReveal } from './ProgressiveReveal';

interface TaskCardProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onFeedback: (taskId: string, feedback: Feedback) => void;
  isDragging?: boolean;
}

export function TaskCard({
  task,
  progress,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onFeedback,
  isDragging,
}: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFeedback = useCallback((feedback: Feedback) => {
    onFeedback(task.id, feedback);
  }, [task.id, onFeedback]);

  const isResearching = task.status === 'researching';
  const isReady = task.status === 'ready';
  const isPersonal = task.status === 'personal';
  const isCompleted = task.status === 'completed';
  const isArchived = task.status === 'archived';

  return (
    <div
      className={`task-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${
        isDragging ? 'dragging' : ''
      } ${isCompleted ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={() => isCompleted ? onRestore(task.id) : onComplete(task.id)}
            className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 transition-colors ${
              isCompleted
                ? 'bg-green-500 border-green-500'
                : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
            }`}
            aria-label={isCompleted ? 'Restore task' : 'Complete task'}
          >
            {isCompleted && (
              <svg className="w-full h-full text-white p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* Title and status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                {task.title}
              </h3>
              {isPersonal && (
                <span className="flex-shrink-0 text-xl" title="Personal task - no research needed">
                  💭
                </span>
              )}
              {task.research?.taskType && (
                <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full">
                  {task.research.taskType}
                </span>
              )}
            </div>

            {/* Researching state */}
            {isResearching && (
              <div className="mt-3">
                <ProgressiveReveal status={progress || null} />
              </div>
            )}

            {/* Ready state - briefing summary */}
            {isReady && task.research && (
              <div className="mt-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {task.research.summary}
                </p>

                {/* Action buttons */}
                {task.research.keyActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.research.keyActions.map((action, index) => (
                      <ActionButton key={index} action={action} />
                    ))}
                  </div>
                )}

                {/* Follow-up question */}
                {task.research.followUpQuestion && (
                  <p className="mt-3 text-sm text-blue-600 dark:text-blue-400 italic">
                    {task.research.followUpQuestion}
                  </p>
                )}

                {/* Expand/collapse for more details */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  {isExpanded ? 'Show less' : 'Show more details'}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-4 space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700 animate-fade-in">
                    {/* Raw markdown / full briefing */}
                    {task.research.rawMarkdown && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                          {task.research.rawMarkdown}
                        </div>
                      </div>
                    )}

                    {/* Sources */}
                    <SourceList sources={task.research.sources} />

                    {/* Confidence indicator */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Confidence:</span>
                      <span className={`font-medium ${
                        task.research.confidence === 'high' ? 'text-green-600 dark:text-green-400' :
                        task.research.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {task.research.confidence}
                      </span>
                    </div>

                    {/* Feedback widget */}
                    <FeedbackWidget feedback={task.feedback} onFeedback={handleFeedback} />
                  </div>
                )}
              </div>
            )}

            {/* Personal task message */}
            {isPersonal && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                This looks like a personal task. No research needed!
              </p>
            )}
          </div>

          {/* Actions menu */}
          <div className="flex-shrink-0 flex items-center gap-1">
            {!isArchived && (
              <button
                onClick={() => onArchive(task.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Archive task"
                title="Archive"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onDelete(task.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Delete task"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
