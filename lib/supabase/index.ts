// Client-side exports
export { supabase, getSupabaseClient } from './client';

// Server-side exports
export {
  supabaseAdmin,
  getSupabaseAdminForUser,
  logAuditEvent,
  checkRateLimit,
} from './server';

// Type exports
export type {
  Database,
  Tables,
  InsertTables,
  UpdateTables,
  TaskStatus,
  AgentActionType,
  UserFeedbackType,
  AgentStepStatus,
  AgentProgressEvent,
  PendingDraft,
  EmailDraftData,
  CalendarEventData,
  AgentFailureState,
  Json,
} from './types';
