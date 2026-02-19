'use client';

import { useState } from 'react';
import { Task, ProgressStatus } from '@/lib/types';
import { CircularCheckbox } from './ui/CircularCheckbox';
import { MaterialIcon } from './ui/MaterialIcon';
import { QuickReferenceCard } from './QuickReferenceCard';

// Detect if task is an informational query (questions don't need QuickReferenceCard)
function isInformationalQuery(title: string): boolean {
  const lowerTitle = title.toLowerCase().trim();
  const questionStarters = [
    'what ', 'who ', 'when ', 'where ', 'how ', 'why ', 'which ',
    'list ', 'show ', 'tell ', 'summarize ', 'find ', 'search ',
    'are there', 'is there', 'do i have', 'did i ',
  ];
  return questionStarters.some(starter => lowerTitle.startsWith(starter));
}

// Detect if task is an email reply (phone numbers aren't relevant for email drafts)
function isEmailReplyTask(title: string): boolean {
  const lowerTitle = title.toLowerCase().trim();
  return lowerTitle.startsWith('reply to') || lowerTitle.startsWith('follow up with');
}

interface CompactTaskCardProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  isDragging?: boolean;
  isSelected?: boolean;
  isAgentRunning?: boolean;
}

export function CompactTaskCard({
  task,
  progress,
  onComplete,
  onShowDetails,
  isDragging = false,
  isSelected = false,
  isAgentRunning = false,
}: CompactTaskCardProps) {
  const isCompleted = task.status === 'completed';
  const isSomeday = task.status === 'someday';
  const isResearching = task.status === 'researching';
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleted) {
      onComplete(task.id);
    } else if (!isCompleting) {
      setIsCompleting(true);
      setTimeout(() => onComplete(task.id), 850);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onShowDetails(task.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onShowDetails(task.id)}
      onKeyDown={handleKeyDown}
      className={`
        w-full text-left flex items-center gap-2 px-3 py-2.5
        transition-colors duration-100 cursor-pointer
        ${isDragging ? 'opacity-50' : ''}
        ${isCompleting ? 'task-completing' : ''}
        ${isSelected
          ? 'bg-inbox-bg-selected'
          : 'bg-transparent hover:bg-inbox-bg-hover'
        }
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inbox-accent focus-visible:ring-inset
      `}
    >
      {/* Checkbox */}
      <div onClick={handleComplete}>
        <CircularCheckbox
          checked={isCompleted || isSomeday || isCompleting}
          onChange={() => {
            if (isCompleted) {
              onComplete(task.id);
            } else if (!isCompleting) {
              setIsCompleting(true);
              setTimeout(() => onComplete(task.id), 850);
            }
          }}
          size="small"
        />
      </div>

      {/* Title, summary, and pin icon */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`
            text-inbox-body break-words
            ${isCompleted || isSomeday ? 'line-through text-inbox-text-tertiary' : 'text-inbox-text-primary'}
          `}>
            {task.title}
          </span>
          {task.isPinned && (
            <MaterialIcon name="push_pin" size={14} weight={300} fill={true} className="text-inbox-accent flex-shrink-0" />
          )}
        </div>
        {/* Brief summary for ready tasks */}
        {task.status === 'ready' && task.research?.summary && (
          <p className="text-inbox-caption text-inbox-text-secondary mt-0.5 line-clamp-1">
            {task.research.summary}
          </p>
        )}
        {/* Quick info from agent execution - hidden for informational queries and email replies */}
        {task.agentQuickInfo && !isInformationalQuery(task.title) && !isEmailReplyTask(task.title) && (
          <div className="mt-1">
            <QuickReferenceCard quickInfo={task.agentQuickInfo} compact />
          </div>
        )}
      </div>

      {/* Loading indicator - when researching or agent running */}
      {(isResearching || progress || isAgentRunning) && (
        <MaterialIcon
          name="progress_activity"
          size={14}
          className="animate-spin flex-shrink-0 text-inbox-accent"
        />
      )}
    </div>
  );
}
