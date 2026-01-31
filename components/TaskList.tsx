'use client';

import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
import { CSS } from '@dnd-kit/utilities';
import { Task, ProgressStatus } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { CompactTaskCard } from './CompactTaskCard';
import { MaterialIcon } from './ui/MaterialIcon';

interface SortableTaskProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
  compact?: boolean;
  isSelected?: boolean;
}

function SortableTask({
  task,
  progress,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onShowDetails,
  compact,
  isSelected,
}: SortableTaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (compact) {
    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        <div className="flex items-center gap-2">
          <button
            {...listeners}
            className="flex-shrink-0 p-1 text-on-surface-variant hover:text-on-surface cursor-grab active:cursor-grabbing touch-none"
            aria-label="Drag to reorder"
          >
            <MaterialIcon name="drag_indicator" size={16} />
          </button>
          <div className="flex-1">
            <CompactTaskCard
              task={task}
              progress={progress}
              onComplete={onComplete}
              onShowDetails={onShowDetails}
              isDragging={isDragging}
              isSelected={isSelected}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center gap-2">
        <button
          {...listeners}
          className="flex-shrink-0 p-1 text-on-surface-variant hover:text-on-surface cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <MaterialIcon name="drag_indicator" size={18} />
        </button>
        <div className="flex-1">
          <TaskCard
            task={task}
            progress={progress}
            onComplete={onComplete}
            onArchive={onArchive}
            onDelete={onDelete}
            onRestore={onRestore}
            onShowDetails={onShowDetails}
            isDragging={isDragging}
          />
        </div>
      </div>
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
  compact = false,
  selectedTaskId,
}: TaskListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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

  if (tasks.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              progress={progressMap[task.id] || null}
              onComplete={onComplete}
              onArchive={onArchive}
              onDelete={onDelete}
              onRestore={onRestore}
              onShowDetails={onShowDetails}
              compact={compact}
              isSelected={selectedTaskId === task.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
