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

// Generic option card for comparing choices (flights, hotels, products, services, etc.)
export interface OptionCard {
  id: string;
  title: string;           // e.g., "United Airlines", "Hilton Garden Inn", "iPhone 15 Pro"
  subtitle?: string;       // e.g., "Flight UA 123", "4-star hotel", "128GB Space Gray"
  price?: string;          // e.g., "$382", "$150/night", "$999"
  priceValue?: number;     // For sorting: 382, 150, 999
  details: string[];       // e.g., ["8:50 AM - 1:39 PM", "4h 49m", "Nonstop"]
  badge?: string;          // e.g., "Best Price", "Recommended", "Fast"
  actionLabel: string;     // e.g., "Book Flight", "Reserve", "Buy Now"
  actionUrl: string;       // Deep link to booking/purchase page
  provider?: string;       // e.g., "Google Flights", "Booking.com", "Amazon"
}

export interface QuickInfo {
  phone?: string;
  phoneFormatted?: string;
  hours?: string;
  address?: string;
  website?: string;
  price?: string;
  details?: string;
}

// UI types the AI can choose based on the task
export type UIType =
  | 'options_list'     // List of comparable options (flights, hotels, products)
  | 'contact_card'     // Phone, hours, address - for appointments, support calls
  | 'info_card'        // General information display
  | 'comparison_table' // Side-by-side comparison
  | 'steps_list';      // Step-by-step instructions

// AI-generated suggested follow-up actions
export interface SuggestedFollowUp {
  label: string;    // Short action phrase, e.g., "generate more options"
  prompt: string;   // Full prompt to send if user clicks
  icon: string;     // Material icon name
}

export interface Research {
  summary: string;
  taskType: string;
  confidence: ConfidenceLevel;
  quickInfo: QuickInfo;
  keyActions: Action[];
  sources: SourceReference[];
  rawMarkdown: string;
  researchedAt: number;
  structuredData?: StructuredData;
  options?: OptionCard[];  // Comparable options (flights, hotels, products, etc.)
  uiType?: UIType;         // AI-selected UI type for this task
  suggestedFollowUps?: SuggestedFollowUp[];  // AI-generated task-specific follow-ups
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Feedback {
  type: FeedbackType;
  comment?: string;
  createdAt: number;
}

export interface AgentQuickInfo {
  phone?: string;
  phoneFormatted?: string;
  hours?: string;
  address?: string;
  email?: string;
  website?: string;
  accountNumber?: string;
  contactName?: string;
  contactTitle?: string;
  deadline?: string;
  price?: string;
  summary?: string;
}

// Persisted agent step for showing what the agent did
export interface AgentStepSummary {
  tool: string;           // Tool name (gmail_search, web_search, etc.)
  detail: string | null;  // Contextual detail (search query, etc.)
  durationMs?: number;    // How long the step took
}

export type TaskSource = 'user' | 'insight';

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
  completedSteps?: string[];
  isPinned?: boolean;
  chatMessages?: ChatMessage[];
  agentQuickInfo?: AgentQuickInfo;  // Key facts from agent execution
  agentSteps?: AgentStepSummary[];  // Persisted agent steps for display
  customPrompt?: string | null;     // Custom prompt for insight-driven tasks
  source?: TaskSource;              // Where task originated: user input or insight scan
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

// Task-specific progress stages for better UX
export const TASK_PROGRESS_STAGES: Record<string, ProgressStatus[]> = {
  travel: [
    { stage: 'analyzing', message: 'Understanding your trip...', progress: 15 },
    { stage: 'searching', message: 'Searching flights & prices...', progress: 45 },
    { stage: 'synthesizing', message: 'Comparing options...', progress: 75 },
    { stage: 'formatting', message: 'Preparing recommendations...', progress: 95 },
  ],
  insurance: [
    { stage: 'analyzing', message: 'Analyzing your coverage needs...', progress: 15 },
    { stage: 'searching', message: 'Finding policy information...', progress: 45 },
    { stage: 'synthesizing', message: 'Reviewing coverage details...', progress: 75 },
    { stage: 'formatting', message: 'Preparing summary...', progress: 95 },
  ],
  shopping: [
    { stage: 'analyzing', message: 'Understanding what you need...', progress: 15 },
    { stage: 'searching', message: 'Searching products & prices...', progress: 45 },
    { stage: 'synthesizing', message: 'Comparing options...', progress: 75 },
    { stage: 'formatting', message: 'Preparing recommendations...', progress: 95 },
  ],
  default: [
    { stage: 'analyzing', message: 'Understanding your request...', progress: 15 },
    { stage: 'searching', message: 'Searching for information...', progress: 45 },
    { stage: 'synthesizing', message: 'Analyzing findings...', progress: 75 },
    { stage: 'formatting', message: 'Preparing results...', progress: 95 },
  ],
};

// =============================================================================
// Supabase Sync Converters
// =============================================================================

import type { Database, Json } from '@/lib/supabase/types';

type SupabaseTaskRow = Database['public']['Tables']['tasks']['Row'];
type SupabaseTaskInsert = Database['public']['Tables']['tasks']['Insert'];

/**
 * Convert client Task to Supabase row format.
 * No status mapping needed - migration 008 added client statuses to DB enum.
 */
export function toSupabaseTask(task: Task, userId: string): SupabaseTaskInsert {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    status: task.status, // Direct - no mapping needed
    order: task.order,
    is_pinned: task.isPinned ?? false,
    research: task.research as unknown as Json | null,
    feedback: task.feedback as unknown as Json | null,
    chat_messages: (task.chatMessages ?? []) as unknown as Json[],
    agent_quick_info: task.agentQuickInfo as unknown as Json | null,
    agent_steps_summary: (task.agentSteps ?? []) as unknown as Json[],
    custom_prompt: task.customPrompt ?? null,
    completed_steps: task.completedSteps ?? [],
    source: task.source ?? 'user',
    created_at: new Date(task.createdAt).toISOString(),
    updated_at: new Date(task.updatedAt).toISOString(),
    completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
  };
}

/**
 * Convert Supabase row to client Task format.
 * No status mapping needed - migration 008 added client statuses to DB enum.
 */
export function fromSupabaseTask(row: SupabaseTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status as TaskStatus, // Direct - no mapping needed
    order: row.order,
    isPinned: row.is_pinned,
    research: row.research as unknown as Research | null,
    feedback: row.feedback as unknown as Feedback | null,
    chatMessages: (row.chat_messages ?? []) as unknown as ChatMessage[],
    agentQuickInfo: row.agent_quick_info as unknown as AgentQuickInfo | undefined,
    agentSteps: (row.agent_steps_summary ?? []) as unknown as AgentStepSummary[],
    customPrompt: row.custom_prompt ?? undefined,
    source: (row.source ?? 'user') as TaskSource,
    completedSteps: row.completed_steps ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
  };
}
