/**
 * AI/Agentic System Type Definitions
 * Implements best practices from 2025-2026 agentic AI guidelines
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Standardized tool result type
 * Returns errors to the model rather than throwing exceptions
 */
export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string; retriable: boolean; timeout?: boolean };

/**
 * Tool call from Claude's response
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ============================================================================
// Agent Step Types (Saga-style persistence)
// ============================================================================

export interface AgentStep {
  id: string;
  stepNumber: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  error?: string;
  isRetriable: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  inputTokens: number;
  outputTokens: number;
}

// ============================================================================
// Agent Failure State
// ============================================================================

export interface AgentFailureState {
  status: 'failed';
  attempted: string[];      // Tools that were attempted
  succeeded: string[];      // Tools that worked
  failed: { tool: string; error: string }[];
  reason: string;           // Why agent gave up
  partialResult?: unknown;  // Any useful partial output
}

// ============================================================================
// Agent Progress Events (SSE streaming)
// ============================================================================

export type AgentProgressEvent =
  | { type: 'started'; taskId: string; timestamp: number }
  | { type: 'thinking'; message: string; timestamp: number }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; timestamp: number }
  | { type: 'tool_result'; tool: string; success: boolean; duration_ms: number; timestamp: number }
  | { type: 'draft_created'; draftType: 'email' | 'calendar'; draftId: string; timestamp: number }
  | { type: 'complete'; result: AgentResult; timestamp: number }
  | { type: 'error'; error: string; recoverable: boolean; timestamp: number }
  | { type: 'cancelled'; reason: string; completedSteps: string[]; timestamp: number }
  | { type: 'budget_exceeded'; tokensUsed: number; partialResult?: unknown; timestamp: number };

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  // Token budget (leave room for final response)
  maxTotalTokens: number;

  // Per-tool timeouts in milliseconds
  toolTimeouts: Record<string, number>;

  // Default tool timeout
  defaultToolTimeout: number;

  // Max iterations (as fallback, prefer token budget)
  maxIterations: number;

  // Model to use
  model: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxTotalTokens: 150_000,
  toolTimeouts: {
    gmail_search: 10_000,
    gmail_read: 5_000,
    gmail_draft: 5_000,
    gmail_send: 10_000,
    calendar_list: 5_000,
    calendar_create: 10_000,
    contacts_search: 5_000,
    contacts_analyze: 45_000,
    web_search: 15_000,
    web_fetch: 20_000,
  },
  defaultToolTimeout: 30_000,
  maxIterations: 30, // Allow more iterations for complex tasks
  // Using Sonnet 4 for 5x cost reduction vs Opus (similar quality for agentic tasks)
  model: 'claude-sonnet-4-20250514',
};

// ============================================================================
// Agent Result
// ============================================================================

/**
 * Source type for where a piece of information came from
 */
export type QuickInfoSource = 'email' | 'web' | 'calendar' | 'contacts';

/**
 * Key facts extracted from agent response for quick reference display
 */
export interface AgentQuickInfo {
  phone?: string;
  phoneFormatted?: string;
  hours?: string;
  address?: string;
  email?: string;
  website?: string;
  accountNumber?: string;  // Policy number, account ID, etc.
  contactName?: string;    // Person to contact
  contactTitle?: string;   // Their role/title
  deadline?: string;       // Time-sensitive info
  price?: string;
  summary?: string;        // One-line executive summary
  /** Sources for each field - maps field name to source type */
  sources?: Partial<Record<keyof Omit<AgentQuickInfo, 'sources'>, QuickInfoSource>>;
}

export type AgentResult =
  | {
      status: 'completed';
      message: string;
      pendingDrafts: PendingDraft[];
      tokensUsed: number;
      stepsCompleted: number;
      quickInfo?: AgentQuickInfo;  // Extracted key facts for quick reference
    }
  | {
      status: 'cancelled';
      reason: string;
      completedSteps: string[];
      tokensUsed: number;
    }
  | {
      status: 'budget_exceeded';
      tokensUsed: number;
      partialResult?: unknown;
    }
  | AgentFailureState;

// ============================================================================
// Pending Draft Types
// ============================================================================

export interface PendingDraft {
  id: string;
  type: 'email_draft' | 'calendar_event';
  data: EmailDraft | CalendarEventDraft;
  createdAt: number;
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  threadId?: string; // For replies - attaches draft to the thread
  messageId?: string; // For replies - Message-ID of email being replied to (for In-Reply-To header)
  references?: string; // For replies - References header chain
  // Original email context for replies (so user can review in context)
  originalEmail?: {
    from: string;
    fromName?: string;
    subject: string;
    body: string;
    date?: string;
  };
}

export interface CalendarEventDraft {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string; displayName?: string }[];
  location?: string;
}

// ============================================================================
// Tool Definition Helper
// ============================================================================

/**
 * Type-safe wrapper for Anthropic tool definitions
 */
export interface TypedTool<TInput extends Record<string, unknown>> extends Tool {
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  taskId: string;
  accessToken?: string; // Google OAuth token if available
  userEmail?: string;   // User's email for scoring/filtering
  abortSignal?: AbortSignal;
}

// ============================================================================
// User Profile for Personalization
// ============================================================================

export interface UserProfile {
  name?: string;
  email?: string;
  timezone?: string;
  location?: string;  // City/area for local searches (e.g., "San Francisco, CA")
  // Future: preferences, communication style, etc.
}

// ============================================================================
// Agent Loop Context
// ============================================================================

export interface AgentLoopContext {
  userId: string;
  taskId: string;
  taskTitle: string;
  taskResearch?: unknown; // Existing research from Gemini
  customPrompt?: string | null; // Custom prompt for insight-driven tasks
  accessToken?: string;
  config: AgentConfig;
  userProfile?: UserProfile; // User context for personalization

  // Streaming callbacks
  onProgress: (event: AgentProgressEvent) => Promise<void>;

  // Cancellation
  abortController: AbortController;

  // State tracking
  steps: AgentStep[];
  totalTokens: number;
}

// ============================================================================
// Message Types for Claude
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

// ============================================================================
// Draft Confirmation Types
// ============================================================================

export interface DraftConfirmation {
  draftId: string;
  action: 'confirm' | 'reject' | 'edit';
  editedData?: EmailDraft | CalendarEventDraft;
  feedback?: string; // Optional feedback if rejecting
}

export interface ConfirmationResult {
  success: boolean;
  // SAFETY: 'draft_saved' and 'calendar_draft_confirmed' are the only write actions
  // We NEVER send emails or create events directly
  action: 'draft_saved' | 'calendar_draft_confirmed' | 'rejected' | 'retry_requested';
  details?: unknown;
  error?: string;
}
