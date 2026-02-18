/**
 * Tool Execution Layer
 *
 * Implements proper error handling per 2025 best practices:
 * - Returns errors to the model rather than throwing exceptions
 * - Distinguishes between retriable and non-retriable errors
 * - Handles timeouts as uncertainty (not failure)
 * - Per-tool timeout configuration
 */

import { v4 as uuidv4 } from 'uuid';
import type { ToolResult, ToolContext, PendingDraft, AgentConfig } from './types';
import { requiresConfirmation } from './tools';

// Import Google API functions
import * as gmail from '../google/gmail';
import * as calendar from '../google/calendar';
import type { CalendarEvent } from '../google/calendar';
import * as contacts from '../google/contacts';
// Import web utilities
import * as web from './web';
// Import email scoring
import { scoreEmails, getTierSummary } from '../email/scoring';
// Import contact analysis
import { analyzeContactRelationship } from '../email/contacts-analysis';
// Import audit logging
import { logAuditEvent } from '../supabase/server';
import type { EmailMetadataWithHeaders } from '../email/types';

/**
 * Redact PII from text before sending to LLM
 * SECURITY: Prevents sensitive data from being sent to Claude
 *
 * PRESERVED (needed for task execution):
 * - Policy numbers, order numbers, tracking numbers, reference IDs, invoice numbers
 *
 * REDACTED:
 * - SSN, credit cards, bank accounts, routing numbers
 * - Passwords, auth tokens, API keys
 * - Date of birth patterns, passport numbers, driver's license numbers
 */
function redactPII(text: string): string {
  if (!text) return text;

  return text
    // SSN: 123-45-6789 or 123 45 6789
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN REDACTED]')
    // Credit card: 16 digits with optional spaces/dashes (Visa, MC, Discover)
    .replace(/\b(?:4\d{3}|5[1-5]\d{2}|6(?:011|5\d{2}))[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CC REDACTED]')
    // Amex: 15 digits starting with 34 or 37
    .replace(/\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g, '[CC REDACTED]')
    // Generic 16-digit card numbers
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CC REDACTED]')
    // Bank account numbers: "Account: 123456789" or "Account #123456789" or "Acct: 123456789"
    // (but NOT "policy number", "order number", etc. — those are preserved)
    .replace(/(?:(?:bank|checking|savings|debit)\s+)?(?:account|acct)\s*#?\s*:?\s*\d{6,}/gi, '[BANK ACCOUNT REDACTED]')
    // Routing numbers: "Routing: 123456789" or "ABA: 123456789"
    .replace(/(?:routing|aba)\s*#?\s*:?\s*\d{9}\b/gi, '[ROUTING REDACTED]')
    // IBAN: 2-letter country code + 2 check digits + up to 30 alphanumeric
    .replace(/\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){1,7}[\dA-Z]{1,4}\b/g, '[IBAN REDACTED]')
    // SWIFT/BIC codes: 8 or 11 alphanumeric chars
    .replace(/\bSWIFT\s*:?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi, '[SWIFT REDACTED]')
    // Passwords in email text: "Password: xyz" or "password is xyz" or "temp password: xyz"
    .replace(/(?:password|passwd|pwd)\s*(?:is|:|=)\s*\S+/gi, '[PASSWORD REDACTED]')
    // API keys / tokens in email text: "API key: xyz" or "token: xyz" or "secret: xyz"
    .replace(/(?:api[_\s]?key|auth[_\s]?token|access[_\s]?token|bearer|secret[_\s]?key)\s*(?:is|:|=)\s*\S+/gi, '[AUTH TOKEN REDACTED]')
    // Date of birth: "DOB: 01/15/1990" or "Date of Birth: 1990-01-15" or "Born: Jan 15, 1990"
    .replace(/(?:date\s+of\s+birth|dob|born|birthday)\s*:?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi, '[DOB REDACTED]')
    .replace(/(?:date\s+of\s+birth|dob|born|birthday)\s*:?\s*\d{4}[/-]\d{1,2}[/-]\d{1,2}/gi, '[DOB REDACTED]')
    .replace(/(?:date\s+of\s+birth|dob|born|birthday)\s*:?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s*\d{4}/gi, '[DOB REDACTED]')
    // Passport numbers: "Passport: AB1234567" or "Passport #: 123456789"
    .replace(/passport\s*#?\s*:?\s*[A-Z0-9]{6,12}/gi, '[PASSPORT REDACTED]')
    // Driver's license: "DL: X12345678" or "Driver's License: 12345678" or "License #: AB-123456"
    .replace(/(?:driver'?s?\s*license|dl|license)\s*#?\s*:?\s*[A-Z0-9][\w-]{5,15}/gi, '[DL REDACTED]')
    // Medical record numbers: "MRN: 123456" or "Medical Record: 123456"
    .replace(/(?:mrn|medical\s+record)\s*#?\s*:?\s*\d{5,}/gi, '[MRN REDACTED]');
}

/**
 * Redact PII from email content object
 */
function redactEmailPII(email: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...email };

  if (typeof redacted.body === 'string') {
    redacted.body = redactPII(redacted.body);
  }
  if (typeof redacted.snippet === 'string') {
    redacted.snippet = redactPII(redacted.snippet);
  }

  // Handle thread messages if present
  if (Array.isArray(redacted.thread)) {
    redacted.thread = redacted.thread.map((msg: Record<string, unknown>) => redactEmailPII(msg));
  }

  return redacted;
}

/**
 * Execute a tool call with proper error handling
 * Returns errors to the model rather than throwing
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext,
  config: AgentConfig
): Promise<{ result: ToolResult; pendingDraft?: PendingDraft }> {
  const timeout = config.toolTimeouts[toolName] ?? config.defaultToolTimeout;

  try {
    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // Merge with external abort signal if provided
    const combinedSignal = context.abortSignal
      ? AbortSignal.any([context.abortSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const result = await executeToolInternal(toolName, input, {
        ...context,
        abortSignal: combinedSignal,
      });

      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        if (context.abortSignal?.aborted) {
          // User cancellation
          return {
            result: {
              success: false,
              error: 'Operation cancelled by user',
              retriable: false,
            },
          };
        } else {
          // Timeout - this is uncertainty, not failure
          return {
            result: {
              success: false,
              error: `Tool timed out after ${timeout}ms. The operation may still be running.`,
              retriable: true,
              timeout: true,
            },
          };
        }
      }

      throw error; // Re-throw for outer catch
    }
  } catch (error) {
    // Categorize errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    const { retriable, category } = categorizeError(errorMessage);

    return {
      result: {
        success: false,
        error: `${category}: ${errorMessage}`,
        retriable,
      },
    };
  }
}

/**
 * Internal tool execution - routes to appropriate handler
 */
async function executeToolInternal(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult; pendingDraft?: PendingDraft }> {
  switch (toolName) {
    // Gmail tools
    case 'gmail_search':
      return executeGmailSearch(input, context);
    case 'gmail_read':
      return executeGmailRead(input, context);
    case 'gmail_draft':
      return executeGmailDraft(input, context);

    // Calendar tools
    case 'calendar_list':
      return executeCalendarList(input, context);
    case 'calendar_create':
      return executeCalendarCreate(input, context);

    // Contacts tools
    case 'contacts_search':
      return executeContactsSearch(input, context);
    case 'contacts_analyze':
      return executeContactsAnalyze(input, context);

    // Web tools
    case 'web_search':
      return executeWebSearch(input, context);
    case 'web_fetch':
      return executeWebFetch(input, context);

    default:
      return {
        result: {
          success: false,
          error: `Unknown tool: ${toolName}`,
          retriable: false,
        },
      };
  }
}

// ============================================================================
// Gmail Tool Implementations
// ============================================================================

async function executeGmailSearch(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  if (!context.accessToken) {
    console.error('Gmail search: No access token available');
    return {
      result: {
        success: false,
        error: 'Gmail access not available. User needs to grant Gmail permissions.',
        retriable: false,
      },
    };
  }

  const query = input.query as string;

  // Detect triage-like queries: broad inbox searches without a specific sender/subject filter
  // These benefit from automatic broadening (more results + older unread)
  const hasSpecificFilter = /from:|to:|subject:|filename:/i.test(query);
  const isTriageQuery = !hasSpecificFilter && /in:inbox|is:unread|newer_than:/i.test(query);

  // For triage, always use 30 regardless of what the agent requested
  const maxResults = isTriageQuery ? 30 : ((input.max_results as number) || 10);

  try {
    console.log('Gmail search: Starting with query:', query);

    // Audit: log query (not results)
    logAuditEvent(context.userId, context.taskId, 'gmail_search', { query, maxResults }).catch(() => {});

    // For triage: also search for older unread emails and merge results
    let emails;
    if (isTriageQuery) {
      const triageMax = Math.max(maxResults, 30);
      const [todayEmails, unreadEmails] = await Promise.all([
        gmail.searchEmails(context.accessToken, query, triageMax),
        gmail.searchEmails(context.accessToken, 'is:unread newer_than:21d', triageMax),
      ]);

      // Merge and deduplicate by email ID
      const seen = new Set<string>();
      emails = [];
      for (const email of [...todayEmails, ...unreadEmails]) {
        if (!seen.has(email.id)) {
          seen.add(email.id);
          emails.push(email);
        }
      }
      console.log(`Gmail search (triage): ${todayEmails.length} today + ${unreadEmails.length} unread → ${emails.length} unique`);
    } else {
      emails = await gmail.searchEmails(context.accessToken, query, maxResults);
    }

    console.log('Gmail search: Found', emails.length, 'emails');

    // If user email is available, score and tier the emails
    if (context.userEmail && emails.length > 0) {
      console.log('Gmail search: Scoring', emails.length, 'emails,', emails.filter(e => e.rawHeaders).length, 'with headers');

      // Convert to EmailMetadataWithHeaders format for scoring
      const emailsWithHeaders = emails
        .filter((email) => email.rawHeaders) // Only score emails with raw headers
        .map((email) => ({
          id: email.id,
          threadId: email.threadId,
          snippet: email.snippet,
          from: email.from,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          date: email.date,
          isUnread: email.isUnread,
          hasAttachments: email.hasAttachments,
          rawHeaders: email.rawHeaders!,
          threadLength: email.threadLength,
          labelIds: email.labelIds,  // Include Gmail labels for category-based scoring
        })) as EmailMetadataWithHeaders[];

      if (emailsWithHeaders.length > 0) {
        const scoredEmails = scoreEmails(emailsWithHeaders, context.userEmail);
        const tierSummary = getTierSummary(scoredEmails);

        console.log('Gmail search: Email tier summary:', tierSummary);

        // Group emails by tier for clearer LLM consumption
        const highPriority = scoredEmails.filter(e => e.tier === 'high');
        const mediumPriority = scoredEmails.filter(e => e.tier === 'medium');
        const lowPriority = scoredEmails.filter(e => e.tier === 'low');
        const skipped = scoredEmails.filter(e => e.tier === 'skip');

        return {
          result: {
            success: true,
            data: {
              // Only send HIGH priority to the agent — these are direct, actionable emails
              priorityEmails: {
                high: highPriority,
              },
              tierSummary,
              totalCount: emails.length,
              filteredOutCount: mediumPriority.length + lowPriority.length + skipped.length,
              hasResults: highPriority.length > 0,
              scoringNote: 'Only high-priority emails are shown — direct messages requiring a response or decision. Bulk, notifications, and FYI items are filtered out. Present like a CEO briefing: actionable items only.',
            },
          },
        };
      }
    } else {
      console.log('Gmail search: No userEmail provided, skipping scoring');
    }

    // Fallback: return unscored emails if scoring not possible
    return {
      result: {
        success: true,
        data: {
          emails,
          count: emails.length,
          hasResults: emails.length > 0,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Gmail search error:', errorMessage);
    return {
      result: {
        success: false,
        error: `Gmail search failed: ${errorMessage}`,
        retriable: true,
      },
    };
  }
}

async function executeGmailRead(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  if (!context.accessToken) {
    return {
      result: {
        success: false,
        error: 'Gmail access not available. User needs to grant Gmail permissions.',
        retriable: false,
      },
    };
  }

  const emailId = input.email_id as string;
  const includeThread = (input.include_thread as boolean) ?? true;

  // Audit: log email ID accessed (not content)
  logAuditEvent(context.userId, context.taskId, 'gmail_read', { emailId }).catch(() => {});

  const email = await gmail.readEmail(context.accessToken, emailId, includeThread);

  // SECURITY: Redact PII (SSN, credit cards, account numbers) before sending to LLM
  const redactedEmail = redactEmailPII(email as unknown as Record<string, unknown>);

  return {
    result: {
      success: true,
      data: redactedEmail,
    },
  };
}

async function executeGmailDraft(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult; pendingDraft: PendingDraft }> {
  // Gmail draft creates a pending draft for user confirmation
  // Does NOT actually send the email

  // Parse original email if provided (for replies)
  const originalEmailInput = input.original_email as {
    from?: string;
    from_name?: string;
    subject?: string;
    body?: string;
    date?: string;
  } | undefined;

  const originalEmail = originalEmailInput ? {
    from: originalEmailInput.from || '',
    fromName: originalEmailInput.from_name,
    subject: originalEmailInput.subject || '',
    body: originalEmailInput.body || '',
    date: originalEmailInput.date,
  } : undefined;

  const draft: PendingDraft = {
    id: uuidv4(),
    type: 'email_draft',
    data: {
      to: input.to as string[],
      cc: input.cc as string[] | undefined,
      bcc: input.bcc as string[] | undefined,
      subject: input.subject as string,
      body: input.body as string,
      threadId: input.thread_id as string | undefined,
      messageId: input.message_id as string | undefined, // For In-Reply-To header
      references: input.references as string | undefined, // For References header
      originalEmail,
    },
    createdAt: Date.now(),
  };

  const emailData = draft.data as { to: string[]; subject: string };
  return {
    result: {
      success: true,
      data: {
        message: 'Email draft created. Awaiting user confirmation before sending.',
        draftId: draft.id,
        preview: {
          to: emailData.to,
          subject: emailData.subject,
        },
      },
    },
    pendingDraft: draft,
  };
}

// ============================================================================
// Calendar Tool Implementations
// ============================================================================

async function executeCalendarList(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  if (!context.accessToken) {
    return {
      result: {
        success: false,
        error: 'Calendar access not available. User needs to grant Calendar permissions.',
        retriable: false,
      },
    };
  }

  const calendarId = (input.calendar_id as string) || 'primary';
  const q = input.q as string | undefined;

  // Determine time range — if agent doesn't specify, use reasonable defaults
  const now = new Date();
  const timeMin = (input.time_min as string) || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = (input.time_max as string) || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const agentMaxResults = (input.max_results as number) || 100;

  // Audit: log date range queried (not event content)
  logAuditEvent(context.userId, context.taskId, 'calendar_list', { timeMin, timeMax, calendarId }).catch(() => {});

  // Detect if this is a broad enough range for pattern analysis (14+ days)
  const timeRangeDays = (new Date(timeMax).getTime() - new Date(timeMin).getTime()) / (1000 * 60 * 60 * 24);
  const isPatternQuery = timeRangeDays >= 14;

  // For pattern analysis, fetch ALL events in the range (no cap)
  // A busy calendar can have 1000+ events/year — capping at 500 misses recent events
  const fetchMaxResults = isPatternQuery ? 2500 : agentMaxResults;

  const events = await calendar.listEvents(context.accessToken, {
    timeMin,
    timeMax,
    maxResults: fetchMaxResults,
    calendarId,
    q,
  });

  // Add pre-computed day-of-week to each event
  const eventsWithDay = events.map(event => addDayOfWeek(event));

  // For broad time ranges, run server-side recurring meeting analysis on ALL fetched events
  let recurringMeetings: RecurringMeetingSummary[] | undefined;
  if (isPatternQuery && eventsWithDay.length >= 5) {
    recurringMeetings = detectRecurringMeetings(eventsWithDay);
  }

  // For pattern queries: return recurringMeetings FIRST (most important) + minimal raw events
  // Tool results are truncated to 8000 chars — recurringMeetings must not be cut off
  if (recurringMeetings && recurringMeetings.length > 0) {
    // Only include a handful of upcoming events for context, not the full set
    const upcomingEvents = eventsWithDay
      .filter(e => new Date(e.start.dateTime || e.start.date || '') >= now)
      .slice(0, 10);
    return {
      result: {
        success: true,
        data: {
          recurringMeetings,
          totalEventsAnalyzed: eventsWithDay.length,
          upcomingEvents,
        },
      },
    };
  }

  // Non-pattern query: return raw events as before
  const returnEvents = eventsWithDay.slice(0, agentMaxResults);
  return {
    result: {
      success: true,
      data: {
        events: returnEvents,
        count: returnEvents.length,
        hasResults: returnEvents.length > 0,
      },
    },
  };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDayOfWeek(event: CalendarEvent): CalendarEvent & { dayOfWeek?: string } {
  const dateStr = event.start.dateTime || event.start.date;
  if (!dateStr) return event;
  // For all-day events (date only, no time), parse directly — they're timezone-safe
  if (event.start.date && !event.start.dateTime) {
    const [y, m, day] = event.start.date.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    return { ...event, dayOfWeek: DAYS[d.getDay()] };
  }
  // For timed events: parse the timezone offset from the ISO string and compute local day
  const offsetMatch = dateStr.match(/([+-])(\d{2}):(\d{2})$/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const offsetMs = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60 * 1000;
    const utcMs = new Date(dateStr).getTime();
    const localMs = utcMs + offsetMs;
    const localDate = new Date(localMs);
    return { ...event, dayOfWeek: DAYS[localDate.getUTCDay()] };
  }
  // Fallback: use UTC day (best effort for dates without offset)
  const d = new Date(dateStr);
  return { ...event, dayOfWeek: DAYS[d.getUTCDay()] };
}

// ============================================================================
// Recurring Meeting Detection (server-side)
// ============================================================================

interface RecurringMeetingSummary {
  title: string;
  occurrences: number;
  cadence: string; // "weekly", "biweekly", "2-3x/week", etc.
  days: string[]; // ["Monday", "Wednesday", "Friday"]
  typicalTime: string; // "7:00 AM"
  /** "solo" (no attendees), "1:1", or "group (N people)" */
  meetingType: string;
  attendees: string[]; // display names or emails (only for 1:1 or small group)
  lastDate: string;
  nextDate: string | null;
  /** Regularity score (0-100). Higher = more regular and active. */
  score: number;
  /** Whether this meeting is still active (has future instances or recent past instances) */
  active: boolean;
}

function detectRecurringMeetings(events: (CalendarEvent & { dayOfWeek?: string })[]): RecurringMeetingSummary[] {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Group events by normalized title
  const groups = new Map<string, (CalendarEvent & { dayOfWeek?: string })[]>();
  for (const event of events) {
    if (!event.summary) continue;
    const key = normalizeEventTitle(event.summary);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  const results: RecurringMeetingSummary[] = [];

  for (const [, groupEvents] of groups) {
    if (groupEvents.length < 3) continue;

    const sorted = groupEvents.sort((a, b) => {
      const da = new Date(a.start.dateTime || a.start.date || '').getTime();
      const db = new Date(b.start.dateTime || b.start.date || '').getTime();
      return da - db;
    });

    // Compute gaps between occurrences (in days)
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].start.dateTime || sorted[i - 1].start.date || '').getTime();
      const curr = new Date(sorted[i].start.dateTime || sorted[i].start.date || '').getTime();
      gaps.push(Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    // Determine cadence — use range for variable frequency (e.g., "2-3x/week")
    let cadence: string;
    let frequencyScore: number;
    if (avgGap <= 3) {
      const perWeek = 7 / avgGap;
      const low = Math.floor(perWeek);
      const high = Math.ceil(perWeek);
      cadence = low === high ? `${low}x/week` : `${low}-${high}x/week`;
      frequencyScore = 40;
    }
    else if (avgGap >= 5 && avgGap <= 9) { cadence = 'weekly'; frequencyScore = 30; }
    else if (avgGap >= 12 && avgGap <= 16) { cadence = 'biweekly'; frequencyScore = 20; }
    else if (avgGap >= 18 && avgGap <= 24) { cadence = 'every ~3 weeks'; frequencyScore = 15; }
    else if (avgGap >= 25 && avgGap <= 35) { cadence = 'monthly'; frequencyScore = 10; }
    else if (avgGap >= 50 && avgGap <= 70) { cadence = 'every ~2 months'; frequencyScore = 5; }
    else continue;

    // Recency: how recently did this meeting last occur? (0-25 points)
    const lastEventDate = new Date(sorted[sorted.length - 1].start.dateTime || sorted[sorted.length - 1].start.date || '');
    const daysSinceLastEvent = Math.max(0, (now.getTime() - lastEventDate.getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = daysSinceLastEvent <= 7 ? 25
      : daysSinceLastEvent <= 30 ? 20
      : daysSinceLastEvent <= 60 ? 10
      : daysSinceLastEvent <= 90 ? 5
      : 0;

    // Active: has future instances? (0-20 points)
    const futureEvents = sorted.filter(e => new Date(e.start.dateTime || e.start.date || '') > now);
    const hasUpcoming = futureEvents.length > 0;
    const activeScore = hasUpcoming ? 20 : 0;

    // Consistency: low variance in gaps = more consistent (0-15 points)
    const gapVariance = gaps.length > 1
      ? gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length
      : 0;
    const coeffOfVariation = avgGap > 0 ? Math.sqrt(gapVariance) / avgGap : 0;
    const consistencyScore = coeffOfVariation < 0.2 ? 15  // Very consistent
      : coeffOfVariation < 0.4 ? 10
      : coeffOfVariation < 0.6 ? 5
      : 0;

    const totalScore = frequencyScore + recencyScore + activeScore + consistencyScore;

    // Is it active? Has future events OR occurred in the last 30 days
    const active = hasUpcoming || lastEventDate >= thirtyDaysAgo;

    // Collect days of week
    const dayCounts = new Map<string, number>();
    for (const e of sorted) {
      const day = e.dayOfWeek || '';
      if (day) dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    }
    const days = Array.from(dayCounts.entries())
      .sort((a, b) => DAY_NAMES.indexOf(a[0]) - DAY_NAMES.indexOf(b[0]))
      .filter(([, count]) => count >= 2)
      .map(([day]) => day);

    // Typical time
    const times = sorted
      .map(e => e.start.dateTime)
      .filter(Boolean)
      .map(dt => {
        const match = dt!.match(/T(\d{2}):(\d{2})/);
        if (!match) return null;
        const h = parseInt(match[1]);
        return `${h > 12 ? h - 12 : h || 12}:${match[2]} ${h >= 12 ? 'PM' : 'AM'}`;
      })
      .filter(Boolean);
    const typicalTime = times.length > 0 ? times[Math.floor(times.length / 2)]! : 'varies';

    // Attendees (deduplicated, skip self) and meeting type
    const attendeeSet = new Set<string>();
    const attendeeCounts: number[] = [];
    for (const e of sorted) {
      const nonSelfAttendees = (e.attendees || []).filter(a => !a.self);
      attendeeCounts.push(nonSelfAttendees.length);
      for (const a of nonSelfAttendees) {
        attendeeSet.add(a.displayName || a.email);
      }
    }
    // Median attendee count to classify meeting type
    const sortedCounts = attendeeCounts.sort((a, b) => a - b);
    const medianAttendees = sortedCounts.length > 0
      ? sortedCounts[Math.floor(sortedCounts.length / 2)]
      : 0;
    const meetingType = medianAttendees === 0 ? 'solo'
      : medianAttendees === 1 ? '1:1'
      : `group (${medianAttendees + 1} people)`;

    const lastDate = sorted[sorted.length - 1].start.dateTime || sorted[sorted.length - 1].start.date || '';
    const nextDate = futureEvents.length > 0
      ? (futureEvents[0].start.dateTime || futureEvents[0].start.date || null)
      : null;

    results.push({
      title: sorted[0].summary,
      occurrences: sorted.length,
      cadence,
      days,
      typicalTime,
      meetingType,
      attendees: medianAttendees <= 3 ? Array.from(attendeeSet).slice(0, 5) : [], // Only list for small meetings
      lastDate,
      nextDate,
      score: totalScore,
      active,
    });
  }

  // Sort by score, filter out low-quality matches (score < 30 = sporadic, not regular)
  return results
    .filter(r => r.score >= 30)
    .sort((a, b) => b.score - a.score || b.occurrences - a.occurrences);
}

/**
 * Normalize event titles to group recurring events that have slight variations.
 * Examples: "Thursday Group Dinner at Elena's" → "thursday group dinner"
 *           "Andrew Hosts First Volleys: WEEK 15" → "andrew hosts first volleys"
 */
function normalizeEventTitle(title: string): string {
  return title.toLowerCase().trim()
    // Remove numbering/week suffixes
    .replace(/\s*#\d+/g, '')
    .replace(/\s*-\s*week\s*\d+/gi, '')
    .replace(/:\s*week\s*\d+/gi, '')
    // Remove dates embedded in titles (e.g., "Meeting 2/15", "Session Jan 10")
    .replace(/\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*/g, ' ')
    .replace(/\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/gi, '')
    // Remove location details after "at" or "@" (e.g., "Dinner at Elena's")
    .replace(/\s+(at|@)\s+.+$/i, '')
    // Remove trailing descriptors after common separators
    .replace(/\s*[-–—]\s*(?:session|meeting|call|check.?in)\s*\d*$/i, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

async function executeCalendarCreate(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult; pendingDraft: PendingDraft }> {
  // Calendar create generates a pending draft for user confirmation
  // Does NOT actually create the event

  const timezone = (input.timezone as string) || 'UTC';

  const draft: PendingDraft = {
    id: uuidv4(),
    type: 'calendar_event',
    data: {
      summary: input.summary as string,
      description: input.description as string | undefined,
      start: {
        dateTime: input.start_time as string,
        timeZone: timezone,
      },
      end: {
        dateTime: input.end_time as string,
        timeZone: timezone,
      },
      attendees: input.attendees as { email: string; displayName?: string }[] | undefined,
      location: input.location as string | undefined,
    },
    createdAt: Date.now(),
  };

  return {
    result: {
      success: true,
      data: {
        message: 'Calendar event draft created. Awaiting user confirmation before creating.',
        draftId: draft.id,
        preview: {
          summary: (draft.data as { summary: string }).summary,
          start: (draft.data as { start: { dateTime: string } }).start.dateTime,
          end: (draft.data as { end: { dateTime: string } }).end.dateTime,
        },
      },
    },
    pendingDraft: draft,
  };
}

// ============================================================================
// Contacts Tool Implementation
// ============================================================================

async function executeContactsSearch(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  if (!context.accessToken) {
    return {
      result: {
        success: false,
        error: 'Contacts access not available. User needs to grant Contacts permissions.',
        retriable: false,
      },
    };
  }

  const query = input.query as string;
  const maxResults = (input.max_results as number) || 10;

  // Audit: log search query (not results)
  logAuditEvent(context.userId, context.taskId, 'contacts_search', { query }).catch(() => {});

  const contactsList = await contacts.searchContacts(context.accessToken, query, maxResults);

  return {
    result: {
      success: true,
      data: {
        contacts: contactsList,
        count: contactsList.length,
        hasResults: contactsList.length > 0,
      },
    },
  };
}

async function executeContactsAnalyze(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  if (!context.accessToken) {
    return {
      result: {
        success: false,
        error: 'Gmail/Calendar access not available. User needs to grant permissions.',
        retriable: false,
      },
    };
  }

  const query = input.query as string;

  // Audit: log query (not results)
  logAuditEvent(context.userId, context.taskId, 'contacts_analyze', { query }).catch(() => {});

  try {
    const relationship = await analyzeContactRelationship(
      context.accessToken,
      query,
      context.userEmail || '',
    );

    return {
      result: {
        success: true,
        data: relationship,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Contacts analyze error:', errorMessage);
    return {
      result: {
        success: false,
        error: `Contact analysis failed: ${errorMessage}`,
        retriable: true,
      },
    };
  }
}

// ============================================================================
// Web Search Tool Implementation
// ============================================================================

async function executeWebSearch(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  const query = input.query as string;
  const maxResults = (input.max_results as number) || 5;

  try {
    const searchResults = await web.webSearch(query, maxResults);

    if (searchResults.results.length === 0) {
      // Check if we have search APIs configured
      const hasTavily = !!process.env.TAVILY_API_KEY;
      const hasGemini = !!process.env.GEMINI_API_KEY;
      return {
        result: {
          success: true,
          data: {
            query,
            results: [],
            hasResults: false,
            message: hasTavily
              ? 'No results found for this query. Try different search terms.'
              : hasGemini
                ? 'Using Gemini knowledge base (not real-time search). For real-time web search, add TAVILY_API_KEY.'
                : 'Web search requires TAVILY_API_KEY or GEMINI_API_KEY environment variable.',
          },
        },
      };
    }

    // Note if using Gemini fallback (not real-time search)
    const hasTavily = !!process.env.TAVILY_API_KEY;
    return {
      result: {
        success: true,
        data: {
          query,
          results: searchResults.results,
          resultCount: searchResults.results.length,
          hasResults: searchResults.results.length > 0,
          searchTime: searchResults.searchTime,
          note: hasTavily ? undefined : 'Results from AI knowledge base. For real-time search, add TAVILY_API_KEY.',
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      result: {
        success: false,
        error: `Web search failed: ${errorMessage}`,
        retriable: true,
      },
    };
  }
}

// ============================================================================
// Web Fetch Tool Implementation
// ============================================================================

async function executeWebFetch(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ result: ToolResult }> {
  const url = input.url as string;

  if (!url) {
    return {
      result: {
        success: false,
        error: 'URL is required',
        retriable: false,
      },
    };
  }

  try {
    const fetchResult = await web.webFetch(url);

    if (fetchResult.error) {
      return {
        result: {
          success: false,
          error: fetchResult.error,
          retriable: true,
        },
      };
    }

    return {
      result: {
        success: true,
        data: {
          url: fetchResult.url,
          title: fetchResult.title,
          content: fetchResult.content,
          excerpt: fetchResult.excerpt,
          publishedDate: fetchResult.publishedDate,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      result: {
        success: false,
        error: `Failed to fetch URL: ${errorMessage}`,
        retriable: true,
      },
    };
  }
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Categorize errors for proper handling
 */
function categorizeError(message: string): { retriable: boolean; category: string } {
  const lowerMessage = message.toLowerCase();

  // Rate limiting - retriable
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
    return { retriable: true, category: 'Rate Limited' };
  }

  // Network errors - retriable
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('socket')
  ) {
    return { retriable: true, category: 'Network Error' };
  }

  // Auth errors - not retriable (need user action)
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('401') ||
    lowerMessage.includes('token expired') ||
    lowerMessage.includes('invalid credentials')
  ) {
    return { retriable: false, category: 'Authentication Error' };
  }

  // Permission errors - not retriable
  if (
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('403') ||
    lowerMessage.includes('permission')
  ) {
    return { retriable: false, category: 'Permission Error' };
  }

  // Not found - not retriable
  if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
    return { retriable: false, category: 'Not Found' };
  }

  // Server errors - retriable
  if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503')) {
    return { retriable: true, category: 'Server Error' };
  }

  // Default: not retriable to be safe
  return { retriable: false, category: 'Error' };
}

