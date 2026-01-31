'use client';

import { useCallback, useState } from 'react';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { DetailPanel } from '@/components/DetailPanel';
import { Sidebar, BottomNav, MobileHeader } from '@/components/Navigation';
import { FAB } from '@/components/ui/FAB';
import { Modal, BottomSheet } from '@/components/ui/Modal';
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
  const { isMobile, isDesktop } = useResponsive();
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const isPanelOpen = selectedTaskId !== null;

  const counts: Record<ViewMode, number> = {
    active: activeTasks.length,
    completed: completedTasks.length,
    archived: archivedTasks.length,
  };

  const handleAddTask = useCallback(async (title: string) => {
    const newTask = addTask(title);
    startResearching(newTask.id);
    setShowAddTaskModal(false);

    // Research runs in background - don't await or block
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
        {/* Mobile Header */}
        <MobileHeader />

        {/* Main Content */}
        <main className="px-4 py-4">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-md text-body-medium">
              {error}
            </div>
          )}

          {/* Remaining requests */}
          <p className="mb-4 text-body-small text-on-surface-variant">
            {remainingRequests} research requests remaining today
          </p>

          {/* Task list */}
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

        {/* Bottom Navigation */}
        <BottomNav
          currentView={viewMode}
          onViewChange={setViewMode}
          counts={counts}
        />

        {/* FAB for adding task */}
        <div className="fixed right-4 bottom-20 z-50 pb-safe-bottom">
          <FAB
            icon="add"
            variant="primary"
            size="medium"
            onClick={() => setShowAddTaskModal(true)}
            aria-label="Add task"
          />
        </div>

        {/* Add Task Bottom Sheet */}
        <BottomSheet
          isOpen={showAddTaskModal}
          onClose={() => setShowAddTaskModal(false)}
          title="Add Task"
        >
          <TaskInput onAddTask={handleAddTask} />
        </BottomSheet>

        {/* Detail Panel as Bottom Sheet */}
        <BottomSheet
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          title={selectedTask?.title || 'Task Details'}
          showCloseButton={false}
        >
          {selectedTask && (
            <DetailPanel
              task={selectedTask}
              isOpen={true}
              onClose={handleClosePanel}
              onFeedback={handleFeedback}
              embedded
            />
          )}
        </BottomSheet>
      </div>
    );
  }

  // Desktop/Tablet Layout
  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar - Desktop */}
      {isDesktop && (
        <Sidebar
          currentView={viewMode}
          onViewChange={setViewMode}
          counts={counts}
          className="w-64 flex-shrink-0 border-r border-outline-variant"
        />
      )}

      {/* Main content - task list */}
      <main className={`flex-1 transition-all duration-300 ${isPanelOpen && isDesktop ? '' : ''}`}>
        <div className={`mx-auto px-6 py-8 transition-all duration-300 ${isPanelOpen ? 'max-w-xl' : 'max-w-2xl'}`}>
          {/* Header - Tablet only */}
          {!isDesktop && (
            <header className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-headline-medium font-display text-on-surface flex items-center gap-2">
                  <MaterialIcon name="task_alt" size={32} className="text-primary" fill />
                  Todone
                </h1>
                <p className="mt-1 text-body-medium text-on-surface-variant">
                  AI-powered task research with CEO-style briefings
                </p>
              </div>
            </header>
          )}

          {/* Task input */}
          <div className="mb-6">
            <TaskInput onAddTask={handleAddTask} />
            {error && (
              <p className="mt-2 text-body-small text-error">
                {error}
              </p>
            )}
            <p className="mt-2 text-body-small text-on-surface-variant">
              {remainingRequests} research requests remaining today
            </p>
          </div>

          {/* View tabs - Tablet only */}
          {!isDesktop && (
            <div className="flex gap-1 mb-6 border-b border-outline-variant">
              <TabButton
                active={viewMode === 'active'}
                onClick={() => setViewMode('active')}
                count={activeTasks.length}
              >
                Active
              </TabButton>
              <TabButton
                active={viewMode === 'completed'}
                onClick={() => setViewMode('completed')}
                count={completedTasks.length}
              >
                Completed
              </TabButton>
              <TabButton
                active={viewMode === 'archived'}
                onClick={() => setViewMode('archived')}
                count={archivedTasks.length}
              >
                Archived
              </TabButton>
            </div>
          )}

          {/* Task list */}
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
                size={64}
                className="text-on-surface-variant/40 mx-auto mb-4"
              />
              <p className="text-body-large text-on-surface-variant">
                {viewMode === 'active'
                  ? 'No active tasks. Add one above to get started!'
                  : viewMode === 'completed'
                    ? 'No completed tasks yet.'
                    : 'No archived tasks.'}
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-outline-variant text-center">
            <p className="text-body-small text-on-surface-variant">
              Powered by Gemini AI with Google Search
            </p>
          </footer>
        </div>
      </main>

      {/* Detail Panel - Desktop side panel */}
      {isDesktop && (
        <div
          className={`flex-shrink-0 w-[480px] bg-surface transition-all duration-300 ${
            isPanelOpen ? 'translate-x-0' : 'translate-x-full w-0 overflow-hidden'
          }`}
        >
          {isPanelOpen && (
            <DetailPanel
              task={selectedTask}
              isOpen={isPanelOpen}
              onClose={handleClosePanel}
              onFeedback={handleFeedback}
            />
          )}
        </div>
      )}

      {/* Detail Panel Modal - Tablet */}
      {!isDesktop && !isMobile && (
        <Modal
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          title={selectedTask?.title || 'Task Details'}
          variant="dialog"
        >
          {selectedTask && (
            <DetailPanel
              task={selectedTask}
              isOpen={true}
              onClose={handleClosePanel}
              onFeedback={handleFeedback}
              embedded
            />
          )}
        </Modal>
      )}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}

function TabButton({ active, onClick, count, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-label-large font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`ml-2 px-2 py-0.5 text-label-small rounded-pill ${
          active
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-high text-on-surface-variant'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
