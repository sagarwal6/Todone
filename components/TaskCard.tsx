'use client';

import { Task, ProgressStatus } from '@/lib/types';
import { ProgressiveReveal } from './ProgressiveReveal';
import { OptionList } from './OptionCard';
import { Card } from './ui/Card';
import { CircularCheckbox } from './ui/CircularCheckbox';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';

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
    <Card
      variant="elevated"
      className={`
        task-card overflow-hidden
        ${isDragging ? 'dragging' : ''}
        ${isCompleted ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Circular Checkbox */}
        <CircularCheckbox
          checked={isCompleted}
          onChange={() => isCompleted ? onRestore(task.id) : onComplete(task.id)}
          size="medium"
          aria-label={isCompleted ? 'Restore task' : 'Complete task'}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <h3 className={`text-title-medium ${isCompleted ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
              {task.title}
            </h3>
            {isPersonal && (
              <span className="flex-shrink-0 text-lg" title="Personal task">💭</span>
            )}
          </div>

          {/* Summary */}
          {isReady && task.research?.summary && (
            <p className="mt-1 text-body-medium text-on-surface-variant">
              {task.research.summary}
            </p>
          )}

          {/* Researching state */}
          {isResearching && (
            <div className="mt-2">
              <ProgressiveReveal status={progress || null} />
            </div>
          )}

          {/* Ready state - minimal info */}
          {isReady && task.research && (
            <div className="mt-2 space-y-2">
              {/* Options list UI - show compact cards */}
              {task.research.options && task.research.options.length > 0 ? (
                <div className="mt-2">
                  <OptionList options={task.research.options} compact maxDisplay={2} />
                  <button
                    onClick={() => onShowDetails(task.id)}
                    className="mt-2 text-label-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    View all {task.research.options.length} options
                    <MaterialIcon name="arrow_forward" size="small" />
                  </button>
                </div>
              ) : (
                <>
                  {/* Price if available */}
                  {quickInfo?.price && (
                    <div className="text-label-large font-medium text-success">
                      {quickInfo.price}
                    </div>
                  )}

                  {/* Details if available */}
                  {quickInfo?.details && (
                    <div className="text-body-medium text-on-surface-variant">
                      {quickInfo.details}
                    </div>
                  )}

                  {/* Quick info: phone and hours */}
                  {(quickInfo?.phoneFormatted || quickInfo?.hours) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-small text-on-surface-variant">
                      {quickInfo?.phoneFormatted && (
                        <span className="flex items-center gap-1.5">
                          <MaterialIcon name="call" size={16} className="text-on-surface-variant" />
                          <span className="font-medium text-on-surface">{quickInfo.phoneFormatted}</span>
                        </span>
                      )}
                      {quickInfo?.hours && (
                        <span className="flex items-center gap-1.5">
                          <MaterialIcon name="schedule" size={16} />
                          {quickInfo.hours}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action buttons row */}
                  <div className="flex items-center gap-3">
                    {/* Call button */}
                    {(quickInfo?.phone || primaryAction?.type === 'phone') && (
                      <Button
                        variant="filled"
                        size="small"
                        icon="call"
                        onClick={handleCall}
                      >
                        Call
                      </Button>
                    )}

                    {/* Website button if no phone */}
                    {!quickInfo?.phone && primaryAction?.type === 'link' && (
                      <Button
                        variant="filled"
                        size="small"
                        icon="open_in_new"
                        onClick={() => window.open(primaryAction.value, '_blank', 'noopener,noreferrer')}
                      >
                        {primaryAction.label}
                      </Button>
                    )}

                    {/* More details link */}
                    <button
                      onClick={() => onShowDetails(task.id)}
                      className="text-label-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    >
                      More details
                      <MaterialIcon name="arrow_forward" size="small" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Personal task */}
          {isPersonal && (
            <p className="mt-2 text-body-small text-on-surface-variant italic">
              Personal task - no research needed
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {!isArchived && (
            <button
              onClick={() => onArchive(task.id)}
              className="p-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8 transition-colors"
              aria-label="Archive"
              title="Archive"
            >
              <MaterialIcon name="inventory_2" size="small" />
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 rounded-full text-on-surface-variant hover:text-error hover:bg-error/8 transition-colors"
            aria-label="Delete"
            title="Delete"
          >
            <MaterialIcon name="delete" size="small" />
          </button>
        </div>
      </div>
    </Card>
  );
}
