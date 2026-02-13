/**
 * Supabase Database Types
 * Auto-generated from schema, with manual additions for type safety
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Enum types matching PostgreSQL enums
// Includes both legacy statuses and client statuses (added in migration 008)
export type TaskStatus =
  | 'added' | 'working' | 'ready' | 'done' | 'failed'  // Legacy (still in DB)
  | 'pending' | 'researching' | 'personal' | 'completed' | 'archived';  // Client statuses
export type AgentActionType = 'email_draft' | 'calendar_event' | 'email_send' | 'calendar_create';
export type UserFeedbackType = 'confirm' | 'reject' | 'edit';
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';

// Progress event structure
export interface AgentProgressEvent {
  type: 'started' | 'thinking' | 'tool_start' | 'tool_result' | 'draft_created' | 'complete' | 'error';
  timestamp: number;
  data: Record<string, unknown>;
}

// Pending draft structure
export interface PendingDraft {
  id: string;
  type: AgentActionType;
  data: EmailDraftData | CalendarEventData;
  created_at: number;
}

export interface EmailDraftData {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  thread_id?: string; // For replies
}

export interface CalendarEventData {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string; displayName?: string }[];
  location?: string;
}

// Failure state structure
export interface AgentFailureState {
  attempted: string[];
  succeeded: string[];
  failed: { tool: string; error: string }[];
  reason: string;
  partial_result?: Record<string, unknown>;
}

// Database table types
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      oauth_tokens: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          access_token: string;
          refresh_token: string | null;
          access_token_expires_at: string;
          refresh_token_issued_at: string | null;
          token_rotation_count: number;
          scopes: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          access_token: string;
          refresh_token?: string | null;
          access_token_expires_at: string;
          refresh_token_issued_at?: string | null;
          token_rotation_count?: number;
          scopes?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          access_token?: string;
          refresh_token?: string | null;
          access_token_expires_at?: string;
          refresh_token_issued_at?: string | null;
          token_rotation_count?: number;
          scopes?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          status: TaskStatus;
          order: number;
          research: Json | null;
          agent_progress: Json[];
          pending_drafts: Json[];
          confirmed_at: string | null;
          confirmed_by: string | null;
          original_draft: Json | null;
          final_draft: Json | null;
          draft_version: number;
          draft_history: Json[];
          user_feedback: UserFeedbackType | null;
          user_feedback_text: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          failure_state: Json | null;
          total_tokens_used: number;
          completed_steps: string[];
          is_pinned: boolean;
          chat_messages: Json[];
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          // Added in migration 008 for cross-device sync
          feedback: Json | null;
          agent_quick_info: Json | null;
          custom_prompt: string | null;
          version: number;
          deleted_at: string | null;
          // Added in migration 009 for source tracking
          source: 'user' | 'insight' | null;
          agent_steps_summary: Json[] | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          status?: TaskStatus;
          order?: number;
          research?: Json | null;
          agent_progress?: Json[];
          pending_drafts?: Json[];
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          original_draft?: Json | null;
          final_draft?: Json | null;
          draft_version?: number;
          draft_history?: Json[];
          user_feedback?: UserFeedbackType | null;
          user_feedback_text?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          failure_state?: Json | null;
          total_tokens_used?: number;
          completed_steps?: string[];
          is_pinned?: boolean;
          chat_messages?: Json[];
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          // Added in migration 008 for cross-device sync
          feedback?: Json | null;
          agent_quick_info?: Json | null;
          custom_prompt?: string | null;
          version?: number;
          deleted_at?: string | null;
          // Added in migration 009 for source tracking
          source?: 'user' | 'insight' | null;
          agent_steps_summary?: Json[] | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          status?: TaskStatus;
          order?: number;
          research?: Json | null;
          agent_progress?: Json[];
          pending_drafts?: Json[];
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          original_draft?: Json | null;
          final_draft?: Json | null;
          draft_version?: number;
          draft_history?: Json[];
          user_feedback?: UserFeedbackType | null;
          user_feedback_text?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          failure_state?: Json | null;
          total_tokens_used?: number;
          completed_steps?: string[];
          is_pinned?: boolean;
          chat_messages?: Json[];
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          // Added in migration 008 for cross-device sync
          feedback?: Json | null;
          agent_quick_info?: Json | null;
          custom_prompt?: string | null;
          version?: number;
          deleted_at?: string | null;
          // Added in migration 009 for source tracking
          source?: 'user' | 'insight' | null;
          agent_steps_summary?: Json[] | null;
        };
      };
      agent_steps: {
        Row: {
          id: string;
          task_id: string;
          step_number: number;
          tool_name: string;
          tool_input: Json;
          tool_output: Json | null;
          error_message: string | null;
          is_retriable: boolean;
          status: AgentStepStatus;
          started_at: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          input_tokens: number;
          output_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          step_number: number;
          tool_name: string;
          tool_input: Json;
          tool_output?: Json | null;
          error_message?: string | null;
          is_retriable?: boolean;
          status?: AgentStepStatus;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          step_number?: number;
          tool_name?: string;
          tool_input?: Json;
          tool_output?: Json | null;
          error_message?: string | null;
          is_retriable?: boolean;
          status?: AgentStepStatus;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
      };
      task_messages: {
        Row: {
          id: string;
          task_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      rate_limits: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          minute_count: number;
          minute_reset_at: string;
          hour_count: number;
          hour_reset_at: string;
          day_count: number;
          day_reset_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          minute_count?: number;
          minute_reset_at?: string;
          hour_count?: number;
          hour_reset_at?: string;
          day_count?: number;
          day_reset_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          minute_count?: number;
          minute_reset_at?: string;
          hour_count?: number;
          hour_reset_at?: string;
          day_count?: number;
          day_reset_at?: string;
          updated_at?: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          task_id: string | null;
          action: string;
          details: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          task_id?: string | null;
          action: string;
          details?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          task_id?: string | null;
          action?: string;
          details?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      check_rate_limit: {
        Args: {
          p_user_id: string;
          p_endpoint: string;
          p_max_per_minute?: number;
          p_max_per_hour?: number;
          p_max_per_day?: number;
        };
        Returns: {
          allowed: boolean;
          limit_type: string | null;
          reset_at: string | null;
        }[];
      };
      log_audit_event: {
        Args: {
          p_user_id: string | null;
          p_task_id: string | null;
          p_action: string;
          p_details?: Json | null;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      task_status: TaskStatus;
      agent_action_type: AgentActionType;
      user_feedback_type: UserFeedbackType;
      agent_step_status: AgentStepStatus;
    };
  };
}

// Helper type for accessing tables
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
