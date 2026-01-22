'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus, Research, Feedback } from '@/lib/types';
import * as taskOps from '@/lib/tasks';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load tasks from localStorage on mount
  useEffect(() => {
    setTasks(taskOps.getAllTasks());
    setIsLoading(false);
  }, []);

  // Refresh tasks from localStorage
  const refreshTasks = useCallback(() => {
    setTasks(taskOps.getAllTasks());
  }, []);

  // Create a new task with optimistic update
  const addTask = useCallback((title: string): Task => {
    const newTask = taskOps.createTask(title);
    setTasks(prev => [...prev, newTask].sort((a, b) => a.order - b.order));
    return newTask;
  }, []);

  // Update task status
  const updateStatus = useCallback((taskId: string, status: TaskStatus): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status, updatedAt: Date.now(), completedAt: status === 'completed' ? Date.now() : null }
        : t
    ));

    taskOps.setTaskStatus(taskId, status);
  }, []);

  // Set task research
  const setResearch = useCallback((taskId: string, research: Research): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, research, status: 'ready' as TaskStatus, updatedAt: Date.now() }
        : t
    ));

    taskOps.setTaskResearch(taskId, research);
  }, []);

  // Mark task as personal (no research needed)
  const markAsPersonal = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'personal' as TaskStatus, research: null, updatedAt: Date.now() }
        : t
    ));

    taskOps.setTaskAsPersonal(taskId);
  }, []);

  // Set task feedback
  const setFeedback = useCallback((taskId: string, feedback: Feedback): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, feedback, updatedAt: Date.now() }
        : t
    ));

    taskOps.setTaskFeedback(taskId, feedback);
  }, []);

  // Mark task as researching
  const startResearching = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'researching' as TaskStatus, updatedAt: Date.now() }
        : t
    ));

    taskOps.markTaskResearching(taskId);
  }, []);

  // Complete a task
  const completeTask = useCallback((taskId: string): void => {
    updateStatus(taskId, 'completed');
  }, [updateStatus]);

  // Archive a task
  const archiveTask = useCallback((taskId: string): void => {
    updateStatus(taskId, 'archived');
  }, [updateStatus]);

  // Restore a task
  const restoreTask = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'ready' as TaskStatus, completedAt: null, updatedAt: Date.now() }
        : t
    ));

    taskOps.restoreTask(taskId);
  }, []);

  // Delete a task
  const deleteTask = useCallback((taskId: string): void => {
    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== taskId));

    taskOps.removeTask(taskId);
  }, []);

  // Update task title
  const updateTitle = useCallback((taskId: string, title: string): void => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, title: title.trim(), updatedAt: Date.now() }
        : t
    ));

    taskOps.updateTaskTitle(taskId, title);
  }, []);

  // Reorder tasks (for drag and drop)
  const reorderTasks = useCallback((taskIds: string[]): void => {
    // Optimistic update
    setTasks(prev => {
      const taskMap = new Map(prev.map(t => [t.id, t]));
      return taskIds
        .map((id, index) => {
          const task = taskMap.get(id);
          return task ? { ...task, order: index } : null;
        })
        .filter((t): t is Task => t !== null);
    });

    taskOps.reorderTaskList(taskIds);
  }, []);

  // Filter helpers
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const archivedTasks = tasks.filter(t => t.status === 'archived');

  return {
    tasks,
    activeTasks,
    completedTasks,
    archivedTasks,
    isLoading,
    addTask,
    updateStatus,
    setResearch,
    markAsPersonal,
    setFeedback,
    startResearching,
    completeTask,
    archiveTask,
    restoreTask,
    deleteTask,
    updateTitle,
    reorderTasks,
    refreshTasks,
  };
}
