import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, Research, Feedback } from './types';
import { getTasks, saveTasks, addTask, updateTask, deleteTask, reorderTasks } from './storage';

export function createTask(title: string): Task {
  const tasks = getTasks();
  const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) : -1;

  const task: Task = {
    id: uuidv4(),
    title: title.trim(),
    status: 'pending',
    order: maxOrder + 1,
    research: null,
    feedback: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
  };

  addTask(task);
  return task;
}

export function getAllTasks(): Task[] {
  return getTasks().sort((a, b) => a.order - b.order);
}

export function getActiveTasks(): Task[] {
  return getAllTasks().filter(t => t.status !== 'completed' && t.status !== 'archived');
}

export function getCompletedTasks(): Task[] {
  return getAllTasks().filter(t => t.status === 'completed');
}

export function getArchivedTasks(): Task[] {
  return getAllTasks().filter(t => t.status === 'archived');
}

export function setTaskStatus(taskId: string, status: TaskStatus): Task | null {
  const updates: Partial<Task> = { status };

  if (status === 'completed') {
    updates.completedAt = Date.now();
  } else {
    updates.completedAt = null;
  }

  return updateTask(taskId, updates);
}

export function setTaskResearch(taskId: string, research: Research): Task | null {
  return updateTask(taskId, {
    research,
    status: 'ready'
  });
}

export function setTaskAsPersonal(taskId: string): Task | null {
  return updateTask(taskId, {
    status: 'personal',
    research: null
  });
}

export function setTaskFeedback(taskId: string, feedback: Feedback): Task | null {
  return updateTask(taskId, { feedback });
}

export function markTaskResearching(taskId: string): Task | null {
  return updateTask(taskId, { status: 'researching' });
}

export function completeTask(taskId: string): Task | null {
  return setTaskStatus(taskId, 'completed');
}

export function archiveTask(taskId: string): Task | null {
  return setTaskStatus(taskId, 'archived');
}

export function restoreTask(taskId: string): Task | null {
  return setTaskStatus(taskId, 'ready');
}

export function removeTask(taskId: string): boolean {
  return deleteTask(taskId);
}

export function updateTaskTitle(taskId: string, title: string): Task | null {
  return updateTask(taskId, { title: title.trim() });
}

export function reorderTaskList(taskIds: string[]): void {
  reorderTasks(taskIds);
}

export function moveTaskToTop(taskId: string): void {
  const tasks = getAllTasks();
  const taskIds = tasks.map(t => t.id);
  const index = taskIds.indexOf(taskId);

  if (index > 0) {
    taskIds.splice(index, 1);
    taskIds.unshift(taskId);
    reorderTasks(taskIds);
  }
}

export function moveTaskToBottom(taskId: string): void {
  const tasks = getAllTasks();
  const taskIds = tasks.map(t => t.id);
  const index = taskIds.indexOf(taskId);

  if (index !== -1 && index < taskIds.length - 1) {
    taskIds.splice(index, 1);
    taskIds.push(taskId);
    reorderTasks(taskIds);
  }
}
