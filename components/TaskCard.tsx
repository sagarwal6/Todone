'use client';

import { useState, useRef } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Task, ProgressStatus } from '@/lib/types';
import { ProgressiveReveal } from './ProgressiveReveal';
import { Card } from './ui/Card';
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

interface TaskCardProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  onTogglePin: (taskId: string) => void;
  isDragging?: boolean;
  isMobile?: boolean;
  isSelected?: boolean;
  showHoverActions?: boolean;
  isAgentRunning?: boolean;
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
  onTogglePin,
  isDragging,
  isMobile = false,
  isSelected = false,
  showHoverActions = false,
  isAgentRunning = false,
}: TaskCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeRevealed, setIsSwipeRevealed] = useState<'left' | 'right' | null>(null);

  const isResearching = task.status === 'researching';
  const isReady = task.status === 'ready';
  const isCompleted = task.status === 'completed';
  const isArchived = task.status === 'archived';

  const quickInfo = task.research?.quickInfo;
  const options = task.research?.options;
  const hasOptions = options && options.length > 0;

  // Track container width for full swipe-through
  const cardRef = useRef<HTMLDivElement>(null);
  const swipeCommittedRef = useRef(false);

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      // Disable swipes while dragging (dnd-kit) to prevent green/blue backgrounds
      if (!isMobile || swipeCommittedRef.current || isDragging) return;
      setSwipeOffset(e.deltaX);
    },
    onSwipedLeft: () => {
      if (!isMobile || isDragging) return;
      const width = cardRef.current?.offsetWidth || 300;
      if (swipeOffset < -(width * 0.4)) {
        // Full swipe-through: animate off-screen then fire action
        swipeCommittedRef.current = true;
        setSwipeOffset(-width);
        setTimeout(() => {
          swipeCommittedRef.current = false;
          onArchive(task.id);
        }, 200);
      } else {
        // Below threshold — always snap back (no stop at tap target)
        setSwipeOffset(0);
        setIsSwipeRevealed(null);
      }
    },
    onSwipedRight: () => {
      if (!isMobile || isDragging) return;
      const width = cardRef.current?.offsetWidth || 300;
      if (swipeOffset > width * 0.4) {
        // Full swipe-through: animate off-screen then fire action
        swipeCommittedRef.current = true;
        setSwipeOffset(width);
        setTimeout(() => {
          swipeCommittedRef.current = false;
          onComplete(task.id);
        }, 200);
      } else {
        // Below threshold — always snap back (no stop at tap target)
        setSwipeOffset(0);
        setIsSwipeRevealed(null);
      }
    },
    onTouchEndOrOnMouseUp: () => {
      if (swipeCommittedRef.current || isDragging) return;
      // Always snap back on touch end if not committed
      setSwipeOffset(0);
      setIsSwipeRevealed(null);
    },
    trackMouse: false,
    trackTouch: true,
  });

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    // Reset swipe if clicking
    if (isSwipeRevealed) {
      setSwipeOffset(0);
      setIsSwipeRevealed(null);
      return;
    }
    onShowDetails(task.id);
  };

  const handleArchive = () => {
    setSwipeOffset(0);
    setIsSwipeRevealed(null);
    onArchive(task.id);
  };

  const handleDelete = () => {
    setSwipeOffset(0);
    setIsSwipeRevealed(null);
    onDelete(task.id);
  };

  // Determine if the card is animating (snap-back or swipe-through)
  const isAnimating = swipeOffset === 0 || swipeCommittedRef.current;

  return (
    <div ref={cardRef} className="relative overflow-hidden">
      {/* Swipe action backgrounds — full width, revealed as card slides */}
      {isMobile && swipeOffset !== 0 && (
        <>
          {/* Done action (swipe right) — green fills from left */}
          {swipeOffset > 0 && (
            <div className="absolute inset-0 bg-inbox-success flex items-center pl-6">
              <MaterialIcon name="check_circle" size={24} className="text-white" />
            </div>
          )}
          {/* Archive action (swipe left) — blue fills from right */}
          {swipeOffset < 0 && (
            <div className="absolute inset-0 bg-primary flex items-center justify-end pr-6">
              <MaterialIcon name="inventory_2" size={24} className="text-on-primary" />
            </div>
          )}
        </>
      )}

      {/* Card content */}
      <div
        {...(isMobile ? swipeHandlers : {})}
        style={isMobile ? { transform: `translateX(${swipeOffset}px)`, transition: isAnimating ? 'transform 0.2s ease-out' : 'none' } : {}}
      >
        <Card
          variant="flat"
          className={`
            task-card cursor-pointer group
            ${isDragging ? 'dragging' : ''}
            ${isCompleted ? 'opacity-60' : ''}
            ${isSelected ? 'bg-inbox-bg-selected' : ''}
            ${isMobile ? '!bg-[var(--inbox-bg-primary)]' : ''}
          `}
          onClick={handleCardClick}
        >
          {/* Main content row */}
          <div className="flex items-center gap-3">
            {/* Circular Checkbox (desktop only — mobile uses swipe gestures) */}
            {!isMobile && (
              <CircularCheckbox
                checked={isCompleted}
                onChange={() => isCompleted ? onRestore(task.id) : onComplete(task.id)}
                size="medium"
                aria-label={isCompleted ? 'Restore task' : 'Complete task'}
              />
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title row */}
              <div className="flex items-center gap-2">
                <h3 className={`text-inbox-body leading-snug ${isCompleted ? 'line-through text-inbox-text-tertiary' : 'text-inbox-text-primary'}`}>
                  {task.title}
                </h3>
                {/* Pin icon inline when pinned (only when hover actions hidden) */}
                {task.isPinned && !isArchived && !isCompleted && !showHoverActions && (
                  <MaterialIcon name="push_pin" size={14} weight={300} fill={true} className="text-inbox-accent flex-shrink-0" />
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
                    <p className="text-inbox-caption text-inbox-text-secondary">
                      {getOptionsSummary(options)}
                    </p>
                  ) : (quickInfo?.phoneFormatted || quickInfo?.hours) ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-inbox-caption text-inbox-text-secondary">
                      {quickInfo?.phoneFormatted && (
                        <span className="flex items-center gap-1.5">
                          <MaterialIcon name="call" size={14} className="text-inbox-text-tertiary" />
                          <span className="text-inbox-text-primary">{quickInfo.phoneFormatted}</span>
                        </span>
                      )}
                      {quickInfo?.hours && (
                        <span className="flex items-center gap-1.5">
                          <MaterialIcon name="schedule" size={14} className="text-inbox-text-tertiary" />
                          {quickInfo.hours}
                        </span>
                      )}
                    </div>
                  ) : quickInfo?.price ? (
                    <p className="text-inbox-caption font-medium text-inbox-success">
                      {quickInfo.price}
                    </p>
                  ) : null}
                </div>
              )}

              {/* Agent quick info - from Claude agent execution (hidden for informational queries) */}
              {task.agentQuickInfo && !isInformationalQuery(task.title) && (
                <div className="mt-1">
                  <QuickReferenceCard quickInfo={task.agentQuickInfo} compact />
                </div>
              )}
            </div>

            {/* Agent running indicator */}
            {isAgentRunning && (
              <div className="flex-shrink-0 flex items-center gap-2 text-inbox-accent">
                <MaterialIcon
                  name="progress_activity"
                  size={18}
                  className="animate-spin"
                />
                <span className="text-inbox-caption">Working...</span>
              </div>
            )}

            {/* Hover actions - only in single-pane view */}
            {showHoverActions && !isMobile && (
              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {!isArchived && !isCompleted && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(task.id); }}
                    className={`p-1.5 rounded-full transition-colors duration-100 ${
                      task.isPinned
                        ? 'text-inbox-accent hover:bg-inbox-accent/10'
                        : 'text-inbox-text-tertiary hover:text-inbox-text-primary hover:bg-inbox-bg-hover'
                    }`}
                    aria-label={task.isPinned ? "Unpin" : "Pin to top"}
                    title={task.isPinned ? "Unpin" : "Pin to top"}
                  >
                    <MaterialIcon name="push_pin" size={18} weight={300} fill={task.isPinned} />
                  </button>
                )}
                {!isArchived && (
                  <button
                    onClick={handleArchive}
                    className="p-1.5 rounded-full text-inbox-text-tertiary hover:text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors duration-100"
                    aria-label="Archive"
                    title="Archive"
                  >
                    <MaterialIcon name="inventory_2" size={18} weight={300} />
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-full text-inbox-text-tertiary hover:text-inbox-error hover:bg-inbox-error/10 transition-colors duration-100"
                  aria-label="Delete"
                  title="Delete"
                >
                  <MaterialIcon name="delete" size={18} weight={300} />
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
