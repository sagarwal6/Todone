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

interface SortableTaskProps {
  task: Task;
  progress?: ProgressStatus | null;
  onComplete: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onShowDetails: (taskId: string) => void;
}

function SortableTask({
  task,
  progress,
  onComplete,
  onArchive,
  onDelete,
  onRestore,
  onShowDetails,
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

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          {...listeners}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="5" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="9" cy="19" r="1.5" />
            <circle cx="15" cy="5" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="15" cy="19" r="1.5" />
          </svg>
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

// Progress map type for tracking multiple tasks
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
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">📝</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No tasks yet</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add a task above to get started with AI-powered research
        </p>
      </div>
    );
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
        <div className="space-y-3">
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
