'use client';

import { Task, ProgressStatus } from '@/lib/types';
import { ProgressiveReveal } from './ProgressiveReveal';

interface TaskCardProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  isDragging?: boolean;
}

export function TaskCard({
  task,
  progress,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onShowDetails,
  isDragging,
}: TaskCardProps) {
  const isResearching = task.status === 'researching';
  const isReady = task.status === 'ready';
  const isPersonal = task.status === 'personal';
  const isCompleted = task.status === 'completed';
  const isArchived = task.status === 'archived';

  const quickInfo = task.research?.quickInfo;
  const primaryAction = task.research?.keyActions.find(a => a.isPrimary) || task.research?.keyActions[0];

  const handleCall = () => {
    if (quickInfo?.phone) {
      window.location.href = quickInfo.phone;
    } else if (primaryAction?.type === 'phone') {
      window.location.href = primaryAction.value;
    }
  };

  return (
    <div
      className={`task-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${
        isDragging ? 'dragging' : ''
      } ${isCompleted ? 'opacity-60' : ''}`}
    >
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

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2">
              <h3 className={`font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                {task.title}
              </h3>
              {isPersonal && (
                <span className="flex-shrink-0 text-lg" title="Personal task">💭</span>
              )}
            </div>

            {/* Researching state */}
            {isResearching && (
              <div className="mt-3">
                <ProgressiveReveal status={progress || null} />
              </div>
            )}

            {/* Ready state - minimal info */}
            {isReady && task.research && (
              <div className="mt-2 space-y-2">
                {/* Quick info: phone and hours */}
                {(quickInfo?.phoneFormatted || quickInfo?.hours) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                    {quickInfo?.phoneFormatted && (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span className="font-medium">{quickInfo.phoneFormatted}</span>
                      </span>
                    )}
                    {quickInfo?.hours && (
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {quickInfo.hours}
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons row */}
                <div className="flex items-center gap-3">
                  {/* Call button */}
                  {(quickInfo?.phone || primaryAction?.type === 'phone') && (
                    <button
                      onClick={handleCall}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call
                    </button>
                  )}

                  {/* Website button if no phone */}
                  {!quickInfo?.phone && primaryAction?.type === 'link' && (
                    <a
                      href={primaryAction.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {primaryAction.label}
                    </a>
                  )}

                  {/* More details link */}
                  <button
                    onClick={() => onShowDetails(task.id)}
                    className="text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                  >
                    More details →
                  </button>
                </div>
              </div>
            )}

            {/* Personal task */}
            {isPersonal && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                Personal task - no research needed
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center gap-1">
            {!isArchived && (
              <button
                onClick={() => onArchive(task.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Archive"
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
              aria-label="Delete"
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
