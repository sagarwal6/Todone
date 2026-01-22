'use client';

import { useCallback, useState } from 'react';
import { TaskInput } from '@/components/TaskInput';
import { TaskList } from '@/components/TaskList';
import { DetailPanel } from '@/components/DetailPanel';
import { useTasks } from '@/hooks/useTasks';
import { useResearch } from '@/hooks/useResearch';
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

  const { isResearching, progress, error, research } = useResearch();
  const [researchingTaskId, setResearchingTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const isPanelOpen = selectedTaskId !== null;

  const handleAddTask = useCallback(async (title: string) => {
    const newTask = addTask(title);
    setResearchingTaskId(newTask.id);
    startResearching(newTask.id);

    try {
      const result = await research(newTask.id, title);

      if (result.isPersonal) {
        markAsPersonal(newTask.id);
      } else if (result.research) {
        setResearch(newTask.id, result.research);
      }
    } catch {
      console.error('Research failed');
    } finally {
      setResearchingTaskId(null);
    }
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Main content - task list */}
      <main className={`flex-1 transition-all duration-300 ${isPanelOpen ? 'mr-0' : ''}`}>
        <div className={`mx-auto px-4 py-8 transition-all duration-300 ${isPanelOpen ? 'max-w-xl' : 'max-w-2xl'}`}>
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Todone
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              AI-powered task research with CEO-style briefings
            </p>
          </header>

          {/* Task input */}
          <div className="mb-6">
            <TaskInput onAddTask={handleAddTask} disabled={isResearching} />
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {remainingRequests} research requests remaining today
            </p>
          </div>

          {/* View tabs */}
          <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
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

          {/* Task list */}
          <TaskList
            tasks={currentTasks}
            researchingTaskId={researchingTaskId}
            progress={progress}
            onComplete={completeTask}
            onArchive={archiveTask}
            onDelete={deleteTask}
            onRestore={restoreTask}
            onShowDetails={handleShowDetails}
            onReorder={reorderTasks}
          />

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-500 dark:text-gray-400">
            <p>Powered by Gemini AI with Google Search</p>
          </footer>
        </div>
      </main>

      {/* Detail Panel - side by side */}
      <div
        className={`flex-shrink-0 w-[480px] border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-all duration-300 ${
          isPanelOpen ? 'translate-x-0' : 'translate-x-full w-0 border-l-0'
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
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
          active
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
