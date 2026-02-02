'use client';

import { Task, ProgressStatus } from '@/lib/types';
import { ProgressiveReveal } from './ProgressiveReveal';
import { Card } from './ui/Card';
import { CircularCheckbox } from './ui/CircularCheckbox';
import { MaterialIcon } from './ui/MaterialIcon';

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

// Generate a concise summary for options (e.g., flights)
function getOptionsSummary(options: { price?: string }[]): string | null {
  if (!options || options.length === 0) return null;

  const prices = options
    .map(o => o.price)
    .filter(Boolean)
    .map(p => {
      const match = p?.match(/\$?([\d,]+)/);
      return match ? parseInt(match[1].replace(',', '')) : null;
    })
    .filter((n): n is number => n !== null);

  if (prices.length === 0) {
    return `${options.length} options available`;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min === max) {
    return `${options.length} options from $${min}`;
  }
  return `${options.length} options from $${min}-$${max}`;
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
  const options = task.research?.options;
  const hasOptions = options && options.length > 0;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    onShowDetails(task.id);
  };

  return (
    <Card
      variant="elevated"
      className={`
        task-card cursor-pointer
        ${isDragging ? 'dragging' : ''}
        ${isCompleted ? 'opacity-60' : ''}
      `}
      onClick={handleCardClick}
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

          {/* Researching state */}
          {isResearching && (
            <div className="mt-2">
              <ProgressiveReveal status={progress || null} />
            </div>
          )}

          {/* Ready state - concise info only */}
          {isReady && task.research && (
            <div className="mt-1">
              {hasOptions ? (
                // Options summary (flights, hotels, etc.)
                <p className="text-body-medium text-on-surface-variant">
                  {getOptionsSummary(options)}
                </p>
              ) : (quickInfo?.phoneFormatted || quickInfo?.hours) ? (
                // Contact info only (no verbose summary)
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-small text-on-surface-variant">
                  {quickInfo?.phoneFormatted && (
                    <span className="flex items-center gap-1.5">
                      <MaterialIcon name="call" size={16} />
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
              ) : quickInfo?.price ? (
                // Just price
                <p className="text-body-medium font-medium text-success">
                  {quickInfo.price}
                </p>
              ) : null}
            </div>
          )}

          {/* Personal tasks: no extra text, just title + emoji above */}
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
