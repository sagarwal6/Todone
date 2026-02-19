/**
 * Insight Scan Type Definitions
 *
 * Types for the proactive email/calendar scanning feature that
 * identifies actionable items and suggests next steps.
 */

// ============================================================================
// Metadata Types (collected from Gmail + Calendar)
// ============================================================================

export interface TopSender {
  email: string;
  name: string;
  count: number;
  lastSubject: string;
  lastDate: string;
}

export interface AwaitingResponse {
  threadId: string;
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  daysAgo: number;
  date: string;
  // Scoring context for better LLM understanding
  isPersonalEmail?: boolean;  // From gmail.com, outlook.com etc (likely real person)
  isDirectEmail?: boolean;    // User was direct recipient (not CC'd)
  priorityScore?: number;     // Computed priority score
}

export interface SentAwaitingReply {
  threadId: string;
  messageId: string;
  to: string[];
  subject: string;
  daysSince: number;
  sentDate: string;
}

export interface UpcomingEvent {
  eventId: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  hasConferenceLink: boolean;
  location?: string;
}

export interface EventNeedsPrep {
  eventId: string;
  title: string;
  start: string;
  hoursUntil: number;
  attendees: string[];
  description?: string;
  // If already prepped, link to existing prep
  alreadyPrepped?: boolean;
  preppedActionId?: string;
  preppedTaskId?: string;
  // Meeting prep score (higher = more important)
  prepScore?: number;
}

export interface ScanContext {
  emails: {
    topSenders: TopSender[];
    awaitingResponse: AwaitingResponse[];
    sentAwaitingReply: SentAwaitingReply[];
    totalScanned: number;
  };
  calendar: {
    upcoming: UpcomingEvent[];
    needsPrep: EventNeedsPrep[];
    totalEvents: number;
    rawEvents?: CalendarEventForLocation[]; // Raw events for location detection
  };
  fetchedAt: string;
  errors?: {
    gmail?: string;
    calendar?: string;
  };
}

// Minimal CalendarEvent type for location detection (avoids circular import)
export interface CalendarEventForLocation {
  location?: string | null;
}

// ============================================================================
// Analysis Output Types (from Claude)
// ============================================================================

export interface InsightPortrait {
  summary: string;           // "You have 3 urgent emails and 2 meetings tomorrow..."
  patterns: string[];        // ["High email from recruiting", "Back-to-back meetings Tuesdays"]
  urgentItems: string[];     // ["Reply to John's email from 3 days ago"]
}

// Action type-specific context
export interface DraftResponseContext {
  threadId: string;
  messageId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  snippet: string;
  daysAgo: number;
  // Chief of staff direction
  suggestedDirection?: string;  // e.g., "Confirm the timeline and offer to schedule a call"
}

export interface MeetingPrepContext {
  eventId: string;
  title: string;
  start: string;
  hoursUntil: number;
  attendees: string[];
  description?: string;
  // Chief of staff additions
  keyAttendee?: string;       // e.g., "Liza Thompson (Partner at Daversa)"
  suggestedFocus?: string;    // e.g., "Focus on partnership terms and timeline"
  // Already prepped - show "View prep" instead of "Prep"
  alreadyPrepped?: boolean;
  preppedActionId?: string;
  preppedTaskId?: string;
}

export interface FollowUpContext {
  threadId: string;
  messageId: string;
  recipients: string[];
  subject: string;
  daysSince: number;
  originalSnippet?: string;
}

export interface SmartLabelContext {
  senderEmail: string;
  senderName: string;
  emailCount: number;
  suggestedLabel: string;
  reason: string;
}

export type InsightActionContext =
  | DraftResponseContext
  | MeetingPrepContext
  | FollowUpContext
  | SmartLabelContext;

export interface InsightAction {
  id: string;
  type: 'draft_response' | 'meeting_prep' | 'follow_up' | 'smart_label';
  priority: 'high' | 'medium' | 'low';
  headline: string;          // "Reply to John Smith"
  detail: string;            // "Waiting 3 days for response about project timeline"
  valueProposition?: string; // "I'll write it, you just review"
  context: InsightActionContext;
}

// ============================================================================
// Bundled Analysis Output (new format)
// ============================================================================

export type BundleType = 'drafts' | 'meetings' | 'followups' | 'organize';

export interface ActionBundle {
  type: BundleType;
  headline: string;           // "3 emails need replies"
  valueProposition: string;   // "I can draft responses for you"
  icon: string;               // Material icon name
  items: InsightAction[];
}

export interface BundledAnalysisResult {
  greeting: string;           // "I found a few ways to help you today."
  quickWin: InsightAction | null;  // Single highest-impact action
  bundles: ActionBundle[];    // Grouped by type (max 3)
}

// ============================================================================
// SSE Progress Events
// ============================================================================

export type ScanProgressEvent =
  | { type: 'metadata_started'; timestamp: number }
  | { type: 'metadata_progress'; source: 'gmail' | 'calendar'; count: number }
  | { type: 'metadata_complete'; emailCount: number; eventCount: number }
  | { type: 'metadata_error'; source: 'gmail' | 'calendar'; error: string }
  | { type: 'analysis_started'; timestamp: number }
  | { type: 'portrait_ready'; portrait: InsightPortrait }
  | { type: 'action_ready'; action: InsightAction; index: number }
  | { type: 'analysis_complete'; result: BundledAnalysisResult }
  | { type: 'complete'; scanId: string; totalActions: number }
  | { type: 'error'; error: string; phase: 'metadata' | 'analysis'; recoverable: boolean };

// ============================================================================
// Scan Result Types
// ============================================================================

export type ScanStatus = 'in_progress' | 'complete' | 'partial' | 'failed';

export interface InsightScan {
  id: string;
  userId: string;
  status: ScanStatus;
  portrait: InsightPortrait | null;
  actions: InsightAction[];
  contextSummary: {
    emailsScanned: number;
    eventsScanned: number;
    errors?: string[];
  };
  errorMessage?: string;
  createdAt: string;
  expiresAt: string;
}

// ============================================================================
// Action Execution Types
// ============================================================================

export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'dismissed';

export interface InsightActionRecord {
  id: string;
  scanId: string;
  type: InsightAction['type'];
  priority: InsightAction['priority'];
  headline: string;
  detail: string;
  executionContext: InsightActionContext;
  status: ActionStatus;
  result?: unknown;
  createdAt: string;
}

// ============================================================================
// Hook State Types
// ============================================================================

export type ScanPhase = 'idle' | 'scanning' | 'analyzing' | 'complete' | 'error';

export interface ScanState {
  phase: ScanPhase;
  portrait: InsightPortrait | null;
  actions: InsightAction[];
  error: string | null;
  scanId: string | null;
  // Progress tracking
  emailsScanned: number;
  eventsScanned: number;
  // New bundled format
  greeting: string | null;
  quickWin: InsightAction | null;
  bundles: ActionBundle[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CachedScanResponse {
  cached: true;
  scan: InsightScan;
}

export interface ExecuteActionRequest {
  actionId: string;
}

export interface ExecuteActionResponse {
  success: boolean;
  taskId?: string; // Links to existing task system for drafts
  error?: string;
}
