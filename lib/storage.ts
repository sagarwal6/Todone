import { Task, RateLimitInfo, StorageData } from './types';

const STORAGE_KEY = 'todone:tasks';
const RATE_LIMIT_KEY = 'todone:ratelimit';
const DEFAULT_USER_ID = 'default';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getStorageKey(key: string): string {
  return `${key}:${DEFAULT_USER_ID}`;
}

export function getTasks(): Task[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(getStorageKey(STORAGE_KEY));
    if (!data) return [];
    return JSON.parse(data) as Task[];
  } catch (error) {
    console.error('Error reading tasks from localStorage:', error);
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(getStorageKey(STORAGE_KEY), JSON.stringify(tasks));
  } catch (error) {
    console.error('Error saving tasks to localStorage:', error);
  }
}

export function getTask(taskId: string): Task | null {
  const tasks = getTasks();
  return tasks.find(t => t.id === taskId) || null;
}

export function updateTask(taskId: string, updates: Partial<Task>): Task | null {
  const tasks = getTasks();
  const index = tasks.findIndex(t => t.id === taskId);

  if (index === -1) return null;

  const updatedTask: Task = {
    ...tasks[index],
    ...updates,
    updatedAt: Date.now(),
  };

  tasks[index] = updatedTask;
  saveTasks(tasks);

  return updatedTask;
}

export function deleteTask(taskId: string): boolean {
  const tasks = getTasks();
  const filteredTasks = tasks.filter(t => t.id !== taskId);

  if (filteredTasks.length === tasks.length) return false;

  saveTasks(filteredTasks);
  return true;
}

export function addTask(task: Task): void {
  const tasks = getTasks();
  tasks.push(task);
  saveTasks(tasks);
}

export function reorderTasks(taskIds: string[]): void {
  const tasks = getTasks();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  const reorderedTasks = taskIds
    .map((id, index) => {
      const task = taskMap.get(id);
      if (task) {
        return { ...task, order: index, updatedAt: Date.now() };
      }
      return null;
    })
    .filter((t): t is Task => t !== null);

  // Add any tasks not in the reorder list at the end
  const reorderedIds = new Set(taskIds);
  const remainingTasks = tasks
    .filter(t => !reorderedIds.has(t.id))
    .map((t, i) => ({ ...t, order: reorderedTasks.length + i }));

  saveTasks([...reorderedTasks, ...remainingTasks]);
}

export function getRateLimitInfo(): RateLimitInfo {
  if (typeof window === 'undefined') {
    return { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
  }

  try {
    const data = localStorage.getItem(getStorageKey(RATE_LIMIT_KEY));
    if (!data) {
      return { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
    }

    const info = JSON.parse(data) as RateLimitInfo;

    // Reset if window has passed
    if (Date.now() > info.resetAt) {
      return { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
    }

    return info;
  } catch (error) {
    console.error('Error reading rate limit from localStorage:', error);
    return { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
  }
}

export function incrementRateLimit(): RateLimitInfo {
  const current = getRateLimitInfo();
  const updated: RateLimitInfo = {
    count: current.count + 1,
    resetAt: current.resetAt,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(getStorageKey(RATE_LIMIT_KEY), JSON.stringify(updated));
  }

  return updated;
}

export function isRateLimited(): boolean {
  const info = getRateLimitInfo();
  return info.count >= RATE_LIMIT_MAX;
}

export function getRemainingRequests(): number {
  const info = getRateLimitInfo();
  return Math.max(0, RATE_LIMIT_MAX - info.count);
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(getStorageKey(STORAGE_KEY));
  localStorage.removeItem(getStorageKey(RATE_LIMIT_KEY));
}
