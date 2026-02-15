'use client';

import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { Task, ProgressStatus } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { CompactTaskCard } from './CompactTaskCard';
import { useResponsive } from '@/hooks/useResponsive';
import { useAgentContext } from '@/contexts/AgentContext';

interface SortableTaskProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  onTogglePin: (taskId: string) => void;
  compact?: boolean;
  isSelected?: boolean;
  isMobile?: boolean;
  isAgentRunning?: boolean;
}

function SortableTask({
  task,
  progress,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onShowDetails,
  onTogglePin,
  compact,
  isSelected,
  isMobile,
  isAgentRunning,
}: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Suppress iOS context menu (copy/lookup/etc) during long-press drag
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <CompactTaskCard
          task={task}
          progress={progress}
          onComplete={onComplete}
          onShowDetails={onShowDetails}
          isDragging={isDragging}
          isSelected={isSelected}
          isAgentRunning={isAgentRunning}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard
        task={task}
        progress={progress}
        onComplete={onComplete}
        onArchive={onArchive}
        onDelete={onDelete}
        onRestore={onRestore}
        onShowDetails={onShowDetails}
        onTogglePin={onTogglePin}
        isDragging={isDragging}
        isMobile={isMobile}
        isSelected={isSelected}
        showHoverActions={true}
        isAgentRunning={isAgentRunning}
      />
    </div>
  );
}

type ProgressMap = Record<string, ProgressStatus | null>;

interface TaskListProps {
  tasks: Task[];
  progressMap?: ProgressMap;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  onReorder: (taskIds: string[]) => void;
  onTogglePin: (taskId: string) => void;
  compact?: boolean;
  selectedTaskId?: string | null;
}

export function TaskList({
  tasks,
  progressMap = {},
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onShowDetails,
  onReorder,
  onTogglePin,
  compact = false,
  selectedTaskId,
}: TaskListProps) {
  const { isMobile } = useResponsive();
  const { isAgentRunning } = useAgentContext();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const newOrder = arrayMove(tasks, oldIndex, newIndex).map((t) => t.id);
      onReorder(newOrder);
    }
  }, [tasks, onReorder]);

  // Separate pinned and unpinned tasks (pinned always at top)
  const pinnedTasks = tasks.filter(t => t.isPinned);
  const unpinnedTasks = tasks.filter(t => !t.isPinned);

  if (tasks.length === 0) {
    return null;
  }

  const renderTask = (task: Task) => (
    <SortableTask
      key={task.id}
      task={task}
      progress={progressMap[task.id] || null}
      onComplete={onComplete}
      onArchive={onArchive}
      onDelete={onDelete}
      onRestore={onRestore}
      onShowDetails={onShowDetails}
      onTogglePin={onTogglePin}
      compact={compact}
      isSelected={selectedTaskId === task.id}
      isMobile={isMobile}
      isAgentRunning={isAgentRunning(task.id)}
    />
  );

  // Combine pinned (at top) and unpinned tasks into single list
  const sortedTasks = [...pinnedTasks, ...unpinnedTasks];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={sortedTasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="divide-y divide-inbox-divider">
          {sortedTasks.map(renderTask)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
