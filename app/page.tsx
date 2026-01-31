'use client';

import { useCallback, useState } from 'react';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { ConversationPanel } from '@/components/ConversationPanel';
import { TaskContextPanel } from '@/components/TaskContextPanel';
import { BottomNav, MobileHeader } from '@/components/Navigation';
import { FAB } from '@/components/ui/FAB';
import { BottomSheet } from '@/components/ui/Modal';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTasks } from '@/hooks/useTasks';
import { useResearch } from '@/hooks/useResearch';
import { useResponsive } from '@/hooks/useResponsive';
import { Feedback } from '@/lib/types';
import { getRemainingRequests } from '@/lib/storage';

type ViewMode = 'active' | 'completed' | 'archived';

export default function Home() {
  const {
    tasks,
    activeTasks,
    completedTasks,
    archivedTasks,
    isLoading,
    addTask,
    completeTask,
    archiveTask,
    restoreTask,
    deleteTask,
    setFeedback,
    setResearch,
    markAsPersonal,
    startResearching,
    reorderTasks,
  } = useTasks();

  const { progressMap, error, research } = useResearch();
  const { isMobile } = useResponsive();
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const isTaskSelected = selectedTaskId !== null && selectedTask !== null;

  const counts: Record<ViewMode, number> = {
    active: activeTasks.length,
    completed: completedTasks.length,
    archived: archivedTasks.length,
  };

  const handleAddTask = useCallback(async (title: string) => {
    const newTask = addTask(title);
    startResearching(newTask.id);
    setShowAddTaskModal(false);

    research(newTask.id, title)
      .then((result) => {
        if (result.isPersonal) {
          markAsPersonal(newTask.id);
        } else if (result.research) {
          setResearch(newTask.id, result.research);
        }
      })
      .catch(() => {
        console.error('Research failed');
      });
  }, [addTask, startResearching, research, markAsPersonal, setResearch]);

  const handleShowDetails = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleFeedback = useCallback((taskId: string, feedback: Feedback) => {
    setFeedback(taskId, feedback);
  }, [setFeedback]);

  const currentTasks = viewMode === 'active'
    ? activeTasks
    : viewMode === 'completed'
      ? completedTasks
      : archivedTasks;

  const remainingRequests = typeof window !== 'undefined' ? getRemainingRequests() : 10;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <MaterialIcon
          name="progress_activity"
          size={32}
          className="animate-spin text-primary"
        />
      </div>
    );
  }

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-surface pb-20">
        <MobileHeader />

        <main className="px-4 py-4">
          {error && (
            <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-md text-body-medium">
              {error}
            </div>
          )}

          <p className="mb-4 text-body-small text-on-surface-variant">
            {remainingRequests} research requests remaining today
          </p>

          <TaskList
            tasks={currentTasks}
            progressMap={progressMap}
            onComplete={completeTask}
            onArchive={archiveTask}
            onDelete={deleteTask}
            onRestore={restoreTask}
            onShowDetails={handleShowDetails}
            onReorder={reorderTasks}
          />

          {currentTasks.length === 0 && (
            <div className="text-center py-12">
              <MaterialIcon
                name={viewMode === 'active' ? 'add_task' : viewMode === 'completed' ? 'task_alt' : 'inventory_2'}
                size={48}
                className="text-on-surface-variant/40 mx-auto mb-4"
              />
              <p className="text-body-large text-on-surface-variant">
                {viewMode === 'active'
                  ? 'No active tasks. Tap + to add one!'
                  : viewMode === 'completed'
                    ? 'No completed tasks yet.'
                    : 'No archived tasks.'}
              </p>
            </div>
          )}
        </main>

        <BottomNav
          currentView={viewMode}
          onViewChange={setViewMode}
          counts={counts}
        />

        <div className="fixed right-4 bottom-20 z-50 pb-safe-bottom">
          <FAB
            icon="add"
            variant="primary"
            size="medium"
            onClick={() => setShowAddTaskModal(true)}
            aria-label="Add task"
          />
        </div>

        <BottomSheet
          isOpen={showAddTaskModal}
          onClose={() => setShowAddTaskModal(false)}
          title="Add Task"
        >
          <TaskInput onAddTask={handleAddTask} />
        </BottomSheet>

        <BottomSheet
          isOpen={isTaskSelected}
          onClose={handleClosePanel}
          title={selectedTask?.title || 'Task Details'}
          showCloseButton={false}
        >
          {selectedTask && (
            <ConversationPanel
              task={selectedTask}
              onClose={handleClosePanel}
              onFeedback={handleFeedback}
            />
          )}
        </BottomSheet>
      </div>
    );
  }

  // Desktop Layout - Two states: clean list OR 3-pane
  return (
    <div className="min-h-screen bg-surface-dim flex flex-col">
      {/* Header with filter bubbles */}
      <header className="flex-shrink-0 bg-surface border-b border-outline-variant px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-headline-small font-display text-on-surface flex items-center gap-2">
              <MaterialIcon name="task_alt" size={28} className="text-primary" fill />
              Todone
            </h1>

            {/* Filter bubbles */}
            <div className="flex items-center gap-2 ml-6">
              <FilterBubble
                active={viewMode === 'active'}
                onClick={() => setViewMode('active')}
                count={counts.active}
                icon="radio_button_unchecked"
                iconActive="task_alt"
              >
                Active
              </FilterBubble>
              <FilterBubble
                active={viewMode === 'completed'}
                onClick={() => setViewMode('completed')}
                count={counts.completed}
                icon="check_circle"
                iconActive="check_circle"
              >
                Completed
              </FilterBubble>
              <FilterBubble
                active={viewMode === 'archived'}
                onClick={() => setViewMode('archived')}
                count={counts.archived}
                icon="inventory_2"
                iconActive="inventory_2"
              >
                Archived
              </FilterBubble>
            </div>
          </div>

          <p className="text-body-small text-on-surface-variant">
            {remainingRequests} requests remaining
          </p>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task List Panel */}
        <div className={`
          flex flex-col bg-surface
          transition-all duration-300 ease-md-standard
          ${isTaskSelected ? 'w-80 flex-shrink-0 border-r border-outline-variant' : 'flex-1'}
        `}>
          {/* Task input - only show when no task selected */}
          {!isTaskSelected && (
            <div className="px-6 py-6 border-b border-outline-variant">
              <TaskInput onAddTask={handleAddTask} />
              {error && (
                <p className="mt-2 text-body-small text-error">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Task list */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isTaskSelected && (
              <div className="mb-4">
                <TaskInput onAddTask={handleAddTask} />
              </div>
            )}

            <TaskList
              tasks={currentTasks}
              progressMap={progressMap}
              onComplete={completeTask}
              onArchive={archiveTask}
              onDelete={deleteTask}
              onRestore={restoreTask}
              onShowDetails={handleShowDetails}
              onReorder={reorderTasks}
              compact={isTaskSelected}
              selectedTaskId={selectedTaskId}
            />

            {currentTasks.length === 0 && (
              <div className="text-center py-12">
                <MaterialIcon
                  name={viewMode === 'active' ? 'add_task' : viewMode === 'completed' ? 'task_alt' : 'inventory_2'}
                  size={isTaskSelected ? 40 : 64}
                  className="text-on-surface-variant/40 mx-auto mb-4"
                />
                <p className={`text-on-surface-variant ${isTaskSelected ? 'text-body-small' : 'text-body-large'}`}>
                  {viewMode === 'active'
                    ? 'No active tasks'
                    : viewMode === 'completed'
                      ? 'No completed tasks'
                      : 'No archived tasks'}
                </p>
              </div>
            )}
          </div>

          {/* Footer - only when not task selected */}
          {!isTaskSelected && (
            <footer className="px-6 py-4 border-t border-outline-variant text-center">
              <p className="text-body-small text-on-surface-variant">
                Powered by Gemini AI with Google Search
              </p>
            </footer>
          )}
        </div>

        {/* Conversation Panel (middle) */}
        {isTaskSelected && selectedTask && (
          <div className="flex-1 min-w-0 border-r border-outline-variant">
            <ConversationPanel
              task={selectedTask}
              onClose={handleClosePanel}
              onFeedback={handleFeedback}
            />
          </div>
        )}

        {/* Context Panel (right) */}
        {isTaskSelected && selectedTask && (
          <div className="w-80 flex-shrink-0">
            <TaskContextPanel task={selectedTask} />
          </div>
        )}
      </div>
    </div>
  );
}

interface FilterBubbleProps {
  active: boolean;
  onClick: () => void;
  count: number;
  icon: string;
  iconActive: string;
  children: React.ReactNode;
}

function FilterBubble({ active, onClick, count, icon, iconActive, children }: FilterBubbleProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-4 py-2
        rounded-pill text-label-large font-medium
        transition-all duration-200 ease-md-standard
        ${active
          ? 'bg-primary-container text-on-primary-container'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }
      `}
    >
      <MaterialIcon
        name={active ? iconActive : icon}
        size="small"
        fill={active}
      />
      {children}
      {count > 0 && (
        <span className={`
          px-2 py-0.5 text-label-small rounded-pill
          ${active ? 'bg-on-primary-container/20' : 'bg-outline/20'}
        `}>
          {count}
        </span>
      )}
    </button>
  );
}
