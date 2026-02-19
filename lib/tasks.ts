import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TaskSource, Research, Feedback, AgentQuickInfo, AgentStepSummary } from './types';
import { getTasks, saveTasks, addTask, updateTask, deleteTask, reorderTasks } from './storage';

export function createTask(title: string, customPrompt?: string | null, source?: TaskSource, sourceRef?: string | null): Task {
  const tasks = getTasks();
  // New tasks go to the top - use minimum order minus 1
  const minOrder = tasks.length > 0 ? Math.min(...tasks.map(t => t.order)) : 1;

  const task: Task = {
    id: uuidv4(),
    title: title.trim(),
    status: 'pending',
    order: minOrder - 1,
    research: null,
    feedback: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    customPrompt: customPrompt || null,
    source: source || 'user',
    sourceRef: sourceRef || null,
  };

  addTask(task);
  return task;
}

export function getAllTasks(): Task[] {
  return getTasks().sort((a, b) => a.order - b.order);
}

export function getActiveTasks(): Task[] {
  return getAllTasks().filter(t => t.status !== 'completed' && t.status !== 'someday');
}

export function getCompletedTasks(): Task[] {
  return getAllTasks().filter(t => t.status === 'completed');
}

export function getSomedayTasks(): Task[] {
  return getAllTasks().filter(t => t.status === 'someday');
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

export function somedayTask(taskId: string): Task | null {
  return setTaskStatus(taskId, 'someday');
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

export function toggleTaskStep(taskId: string, stepLabel: string): Task | null {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);

  if (!task) return null;

  const completedSteps = task.completedSteps || [];
  const isCompleted = completedSteps.includes(stepLabel);

  const newCompletedSteps = isCompleted
    ? completedSteps.filter(s => s !== stepLabel)
    : [...completedSteps, stepLabel];

  return updateTask(taskId, { completedSteps: newCompletedSteps });
}

export function pinTask(taskId: string): Task | null {
  return updateTask(taskId, { isPinned: true });
}

export function unpinTask(taskId: string): Task | null {
  return updateTask(taskId, { isPinned: false });
}

export function togglePinTask(taskId: string): Task | null {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  return updateTask(taskId, { isPinned: !task.isPinned });
}

export function addChatMessage(taskId: string, message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number }): Task | null {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;

  const chatMessages = task.chatMessages || [];

  // Deduplication: check if message with this ID already exists
  if (chatMessages.some(m => m.id === message.id)) {
    return task; // Already exists, return without adding
  }

  return updateTask(taskId, { chatMessages: [...chatMessages, message] });
}

export function setAgentQuickInfo(taskId: string, agentQuickInfo: AgentQuickInfo): Task | null {
  return updateTask(taskId, { agentQuickInfo });
}

export function setAgentSteps(taskId: string, agentSteps: AgentStepSummary[]): Task | null {
  return updateTask(taskId, { agentSteps });
}
