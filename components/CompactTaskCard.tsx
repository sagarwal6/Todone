'use client';

import { Task, ProgressStatus } from '@/lib/types';
import { CircularCheckbox } from './ui/CircularCheckbox';
import { MaterialIcon } from './ui/MaterialIcon';

interface CompactTaskCardProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  isDragging?: boolean;
  isSelected?: boolean;
}

export function CompactTaskCard({
  task,
  progress,
  onComplete,
  onShowDetails,
  isDragging = false,
  isSelected = false,
}: CompactTaskCardProps) {
  const isCompleted = task.status === 'completed';
  const isArchived = task.status === 'archived';
  const isResearching = task.status === 'researching';

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onComplete(task.id);
  };

  return (
    <button
      onClick={() => onShowDetails(task.id)}
      className={`
        w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-all duration-200 ease-md-standard
        ${isDragging ? 'opacity-50' : ''}
        ${isSelected
          ? 'bg-primary-container text-on-primary-container'
          : 'bg-surface hover:bg-surface-container-high'
        }
      `}
    >
      {/* Checkbox */}
      <div onClick={handleComplete}>
        <CircularCheckbox
          checked={isCompleted || isArchived}
          onChange={() => onComplete(task.id)}
          size="small"
        />
      </div>

      {/* Title */}
      <span className={`
        flex-1 text-body-medium truncate
        ${isCompleted || isArchived ? 'line-through opacity-60' : ''}
        ${isSelected ? 'text-on-primary-container' : 'text-on-surface'}
      `}>
        {task.title}
      </span>

      {/* Status indicator */}
      {(isResearching || progress) && (
        <MaterialIcon
          name="progress_activity"
          size={16}
          className={`animate-spin flex-shrink-0 ${isSelected ? 'text-on-primary-container' : 'text-primary'}`}
        />
      )}

      {task.research && !isResearching && !progress && (
        <MaterialIcon
          name="auto_awesome"
          size={16}
          className={`flex-shrink-0 ${isSelected ? 'text-on-primary-container/70' : 'text-on-surface-variant'}`}
        />
      )}
    </button>
  );
}
