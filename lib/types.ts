export type TaskStatus = 'pending' | 'researching' | 'ready' | 'personal' | 'completed' | 'archived';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ActionType = 'link' | 'phone' | 'email' | 'copy';

export type SourceType = 'web' | 'email' | 'document';

export type FeedbackType = 'positive' | 'negative';

export interface Action {
  label: string;
  type: ActionType;
  value: string;
  isPrimary: boolean;
}

export interface SourceReference {
  title: string;
  url: string | null;
  type: SourceType;
  confidence: ConfidenceLevel;
  snippet: string | null;
}

export interface StructuredData {
  [key: string]: string | number | boolean | null | StructuredData | StructuredData[];
}

export interface Research {
  summary: string;
  taskType: string;
  confidence: ConfidenceLevel;
  keyActions: Action[];
  sources: SourceReference[];
  followUpQuestion: string | null;
  rawMarkdown: string;
  researchedAt: number;
  structuredData?: StructuredData;
}

export interface Feedback {
  type: FeedbackType;
  comment?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  order: number;
  research: Research | null;
  feedback: Feedback | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface ResearchRequest {
  taskId: string;
  taskTitle: string;
}

export interface ResearchResponse {
  success: boolean;
  research?: Research;
  isPersonal?: boolean;
  error?: string;
}

export interface RateLimitInfo {
  count: number;
  resetAt: number;
}

export interface StorageData {
  tasks: Task[];
  rateLimit: RateLimitInfo;
}

export interface ProgressStatus {
  stage: 'analyzing' | 'searching' | 'synthesizing' | 'formatting';
  message: string;
  progress: number;
}

export const PROGRESS_STAGES: ProgressStatus[] = [
  { stage: 'analyzing', message: 'Analyzing your task...', progress: 15 },
  { stage: 'searching', message: 'Searching for relevant information...', progress: 45 },
  { stage: 'synthesizing', message: 'Synthesizing insights...', progress: 75 },
  { stage: 'formatting', message: 'Preparing your briefing...', progress: 95 },
];
