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

    // Race the tool execution against the timeout/abort signal
    // This ensures timeouts actually work even if internal code doesn't check the signal
    // (e.g., meeting_prep's parallel fetches don't pass abort signal to HTTP requests)
    const timeoutPromise = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new DOMException('Tool execution aborted', 'AbortError'));
      if (combinedSignal.aborted) {
        onAbort();
        return;
      }
      combinedSignal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      const result = await Promise.race([
        executeToolInternal(toolName, input, {
          ...context,
          abortSignal: combinedSignal,
        }),
        timeoutPromise,
      ]);

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

    // Compound tools
    case 'gmail_triage':
      return executeGmailTriage(input, context);
    case 'meeting_prep':
      return executeMeetingPrep(input, context);

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
// Gmail Triage Compound Tool Implementation
// ============================================================================

async function executeGmailTriage(
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

  const query = (input.query as string) || 'in:inbox newer_than:3d';
  const maxResults = (input.max_results as number) || 30;
  const previewCount = (input.preview_count as number) || 3;

  // Audit: log triage request (not results)
  logAuditEvent(context.userId, context.taskId, 'gmail_triage', { query, maxResults, previewCount }).catch(() => {});

  try {
    // ── Phase 1: Parallel search (main query + unread broadening) ──
    const [mainEmails, unreadEmails] = await Promise.all([
      gmail.searchEmails(context.accessToken, query, maxResults),
      gmail.searchEmails(context.accessToken, 'is:unread newer_than:21d', 30),
    ]);

    // Deduplicate by email ID
    const seen = new Set<string>();
    const allEmails = [];
    for (const email of [...mainEmails, ...unreadEmails]) {
      if (!seen.has(email.id)) {
        seen.add(email.id);
        allEmails.push(email);
      }
    }
    console.log(`Gmail triage: ${mainEmails.length} main + ${unreadEmails.length} unread → ${allEmails.length} unique`);

    // ── Phase 2: Score and filter ──
    if (!context.userEmail || allEmails.length === 0) {
      return {
        result: {
          success: true,
          data: {
            highPriorityEmails: [],
            threadPreviews: [],
            tierSummary: { high: 0, medium: 0, low: 0, skip: 0 },
            totalSearched: allEmails.length,
          },
        },
      };
    }

    // Convert to EmailMetadataWithHeaders for scoring
    const emailsWithHeaders = allEmails
      .filter((email) => email.rawHeaders)
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
        labelIds: email.labelIds,
      })) as EmailMetadataWithHeaders[];

    if (emailsWithHeaders.length === 0) {
      return {
        result: {
          success: true,
          data: {
            highPriorityEmails: [],
            threadPreviews: [],
            tierSummary: { high: 0, medium: 0, low: 0, skip: 0 },
            totalSearched: allEmails.length,
          },
        },
      };
    }

    const scoredEmails = scoreEmails(emailsWithHeaders, context.userEmail);
    const tierSummary = getTierSummary(scoredEmails);
    const highPriority = scoredEmails.filter(e => e.tier === 'high');

    console.log(`Gmail triage: Scored ${scoredEmails.length} emails, ${highPriority.length} HIGH priority`);

    // ── Phase 3: Preview top HIGH-priority threads in parallel ──
    // Sort by score (desc), then recency (desc)
    const sorted = [...highPriority].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    const toPreview = sorted.slice(0, previewCount);
    // Deduplicate thread IDs (multiple emails can share a thread)
    const threadIdsToRead = [...new Set(toPreview.map(e => e.threadId))];

    let threadPreviews: NonNullable<ReturnType<typeof readRecentThreads> extends Promise<infer T> ? T : never> = [];
    if (threadIdsToRead.length > 0) {
      const previews = await readRecentThreads(context.accessToken, threadIdsToRead);
      if (previews) {
        threadPreviews = previews;
      }
    }

    // ── Phase 4: Build gaps for unpreviewed HIGH emails ──
    const gaps: string[] = [];
    if (highPriority.length > previewCount) {
      const remaining = sorted.slice(previewCount);
      const remainingIds = remaining.map(e => e.threadId).filter((id, i, arr) => arr.indexOf(id) === i);
      gaps.push(`${remaining.length} more HIGH-priority email(s) not previewed — use gmail_read with threadIds: [${remainingIds.slice(0, 5).join(', ')}]${remainingIds.length > 5 ? ` (+${remainingIds.length - 5} more)` : ''}`);
    }

    return {
      result: {
        success: true,
        data: {
          highPriorityEmails: highPriority,
          threadPreviews,
          tierSummary,
          totalSearched: allEmails.length,
          gaps: gaps.length > 0 ? gaps : undefined,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Gmail triage error:', errorMessage);
    return {
      result: {
        success: false,
        error: `Gmail triage failed: ${errorMessage}`,
        retriable: true,
      },
    };
  }
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
// Meeting Prep Tool Implementation
// ============================================================================

interface AttendeeResearch {
  name: string;
  email?: string;
  phone?: string;
  relationship: 'new' | 'familiar' | 'close';

  // Communication history (from contacts_analyze)
  emailCount: number;
  meetingCount: number;
  lastContact?: string;
  recentTopics: string[];
  /** Thread IDs for recent emails — agent can gmail_read these for full context */
  recentThreadIds?: string[];
  pendingItems?: string;

  /** Summaries of the last 1-3 email conversations — includes action items, attachments, links */
  recentConversations?: {
    threadId: string;
    subject: string;
    lastDate: string;
    summary: string;  // Key content: what was discussed, decisions made
    actionItems?: string[];  // Extracted action items / open questions
    attachments?: string[];  // Attachment filenames
    links?: string[];  // URLs shared in the conversation
    gmailUrl: string;  // Direct link to thread
  }[];

  // Professional background (from web research)
  title?: string;
  company?: string;
  bio?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  recentActivity?: string;

  // Company info (if relevant)
  companyInfo?: {
    description: string;
    recentNews?: string;
    website?: string;
  };
}

interface MeetingPrepBrief {
  meetingTitle: string;
  meetingTime?: string;
  attendees: AttendeeResearch[];
  /** How the meeting was set up — from scheduling emails */
  schedulingContext?: string;
  /** Thread ID of the scheduling email — agent can gmail_read for full context */
  schedulingThreadId?: string;
  suggestedTalkingPoints: string[];
  keyLinks: { label: string; url: string }[];
}

/**
 * Map relationship strength from contacts_analyze to meeting prep categories
 */
function mapRelationship(strength: string): 'new' | 'familiar' | 'close' {
  switch (strength) {
    case 'high': return 'close';
    case 'medium': return 'familiar';
    default: return 'new';
  }
}

/**
 * Extract a company name from contact analysis or web search results
 */
function extractCompany(contactData: { email: { matchedEmails: string[] } }): string | null {
  // Try to extract company from email domain
  for (const email of contactData.email.matchedEmails) {
    const domain = email.split('@')[1];
    if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com'].includes(domain)) {
      // Use domain name as company hint (strip TLD)
      return domain.split('.')[0];
    }
  }
  return null;
}

/**
 * Extract LinkedIn URL from web search results
 */
function findLinkedInUrl(results: web.WebSearchResult[]): string | undefined {
  const linkedin = results.find(r => r.url.includes('linkedin.com/in/'));
  return linkedin?.url;
}

/**
 * Extract Twitter/X URL from web search results
 */
function findTwitterUrl(results: web.WebSearchResult[]): string | undefined {
  const twitter = results.find(r =>
    r.url.includes('twitter.com/') || r.url.includes('x.com/')
  );
  return twitter?.url;
}

/**
 * Build a short bio from web search snippets
 */
function buildBio(results: web.WebSearchResult[], _name: string): string | undefined {
  const relevant = results
    .filter(r => r.snippet && r.snippet.length > 30)
    .slice(0, 3);
  if (relevant.length === 0) return undefined;

  // Combine snippets, deduplicate, and truncate
  const combined = relevant.map(r => r.snippet).join(' ');
  // Truncate to ~200 chars at a sentence boundary
  if (combined.length <= 200) return combined;
  const truncated = combined.substring(0, 200);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > 100 ? truncated.substring(0, lastPeriod + 1) : truncated + '...';
}

/**
 * Extract structured info from a fetched LinkedIn page
 */
function extractLinkedInInfo(fetchResult: web.WebFetchResult): { title?: string; bio?: string; company?: string; recentActivity?: string } {
  const content = fetchResult.content || '';
  const info: { title?: string; bio?: string; company?: string; recentActivity?: string } = {};

  // Try to extract title/headline (usually near the top of LinkedIn profiles)
  const titlePatterns = [
    /(?:^|\n)\s*([^\n]+(?:at|@)\s+[^\n]+)/i,
    /(?:^|\n)\s*([^\n]*(?:CEO|CTO|COO|CFO|VP|Director|Manager|Head of|Lead|Founder|Partner|Engineer|Designer|Consultant|Analyst|Principal)[^\n]*)/i,
  ];
  for (const pattern of titlePatterns) {
    const match = content.match(pattern);
    if (match && match[1].length < 150) {
      info.title = match[1].trim();
      // Extract company from "Title at Company" pattern
      const atMatch = info.title.match(/(?:at|@)\s+(.+)/i);
      if (atMatch) info.company = atMatch[1].trim().substring(0, 80);
      break;
    }
  }

  // Build bio from the first meaningful paragraph
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50 && p.trim().length < 500);
  if (paragraphs.length > 0) {
    info.bio = paragraphs[0].trim().substring(0, 250);
    if (info.bio.length === 250) {
      const lastPeriod = info.bio.lastIndexOf('.');
      if (lastPeriod > 150) info.bio = info.bio.substring(0, lastPeriod + 1);
      else info.bio += '...';
    }
  }

  // Look for recent activity (posts, articles)
  const activityMatch = content.match(/(?:posted|published|shared|wrote)\s*[:|-]?\s*([^\n]{20,200})/i);
  if (activityMatch) {
    info.recentActivity = activityMatch[1].trim();
  }

  return info;
}

/**
 * Read recent email threads and extract key content: action items, attachments, links
 */
async function readRecentThreads(
  accessToken: string,
  threadIds: string[],
): Promise<AttendeeResearch['recentConversations']> {
  const conversations: NonNullable<AttendeeResearch['recentConversations']> = [];

  // Read threads in parallel (limit passed by caller, typically 3-8)
  const threadReads = await Promise.all(
    threadIds.map(async (threadId) => {
      try {
        // Fetch the thread with full message content
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    }),
  );

  for (const thread of threadReads) {
    if (!thread?.messages?.length) continue;

    const messages = thread.messages;
    const lastMessage = messages[messages.length - 1];
    const headers = lastMessage.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: { name: string; value: string }) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject') || '(no subject)';
    const lastDate = getHeader('Date') || '';

    // Collect body text from all messages in thread (truncated)
    const bodies: string[] = [];
    for (const msg of messages) {
      const body = extractTextFromPayload(msg.payload);
      if (body) bodies.push(body.substring(0, 800));
    }
    const fullText = bodies.join('\n---\n');

    // Extract action items (lines with action-like language)
    const actionItems: string[] = [];
    const actionPatterns = [
      /(?:action item|todo|to-do|next step|follow[- ]?up|please|can you|could you|need to|should|will you|let's|deadline|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|end of))[:\s]+([^\n]{10,120})/gi,
      /(?:^|\n)\s*[-•*]\s*((?:action|todo|follow|send|schedule|prepare|review|update|confirm|finalize|share|draft|submit|complete|deliver)[^\n]{10,120})/gi,
    ];
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(fullText)) !== null) {
        const item = match[1].trim();
        if (item && !actionItems.includes(item)) {
          actionItems.push(item);
        }
        if (actionItems.length >= 5) break;
      }
    }

    // Extract attachments from all messages
    const attachments: string[] = [];
    for (const msg of messages) {
      if (msg.payload?.parts) {
        for (const part of msg.payload.parts) {
          if (part.filename && part.filename.length > 0 &&
              part.mimeType !== 'text/plain' && part.mimeType !== 'text/html' &&
              !part.mimeType?.startsWith('multipart/')) {
            attachments.push(part.filename);
          }
          // Check nested parts too
          if (part.parts) {
            for (const nested of part.parts) {
              if (nested.filename && nested.filename.length > 0 &&
                  nested.mimeType !== 'text/plain' && nested.mimeType !== 'text/html') {
                attachments.push(nested.filename);
              }
            }
          }
        }
      }
    }

    // Extract URLs from email bodies
    const links: string[] = [];
    const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;
    let urlMatch;
    while ((urlMatch = urlPattern.exec(fullText)) !== null) {
      const url = urlMatch[0];
      // Skip tracking/unsubscribe URLs
      if (url.includes('unsubscribe') || url.includes('tracking') ||
          url.includes('click.') || url.includes('mailchimp') ||
          url.includes('google.com/url')) continue;
      if (!links.includes(url)) links.push(url);
      if (links.length >= 5) break;
    }

    // Build summary from the last 1-2 messages (most recent context)
    const recentBodies = bodies.slice(-2).join('\n');
    const summary = recentBodies.length > 400
      ? recentBodies.substring(0, 400) + '...'
      : recentBodies;

    conversations.push({
      threadId: thread.messages[0].threadId,
      subject: redactPII(subject),
      lastDate,
      summary: redactPII(summary),
      actionItems: actionItems.length > 0 ? actionItems.map(redactPII) : undefined,
      attachments: attachments.length > 0 ? [...new Set(attachments)] : undefined,
      links: links.length > 0 ? links : undefined,
      gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${thread.messages[0].threadId}`,
    });
  }

  return conversations.length > 0 ? conversations : undefined;
}

/**
 * Extract text body from a Gmail message payload
 */
function extractTextFromPayload(payload: { body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string } }[] }[] }): string {
  if (payload.body?.data) {
    const base64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(
        atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
    } catch { return ''; }
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
        try {
          return decodeURIComponent(
            atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
          );
        } catch { return ''; }
      }
      if (part.parts) {
        const text = extractTextFromPayload({ ...payload, parts: part.parts as typeof payload.parts });
        if (text) return text;
      }
    }
  }
  return '';
}

/**
 * Extract company description from a fetched company page
 */
function extractCompanyInfo(fetchResult: web.WebFetchResult): { description: string; website?: string } {
  const content = fetchResult.content || '';
  // Get the first substantial paragraph as description
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 40 && p.trim().length < 400);
  const description = paragraphs[0]?.trim().substring(0, 200) || fetchResult.excerpt || '';
  return { description, website: fetchResult.url };
}

/**
 * Research a single attendee — 2-pass: parallel search burst, then targeted deep-dives
 */
async function researchAttendee(
  attendeeName: string,
  accessToken: string,
  userEmail: string,
): Promise<AttendeeResearch> {
  // ── Pass 1: Contact history + parallel web searches ──
  let contactData;
  try {
    contactData = await analyzeContactRelationship(accessToken, attendeeName, userEmail);
  } catch {
    contactData = null;
  }

  const relationship = contactData ? mapRelationship(contactData.strength) : 'new';
  const topPerson = contactData?.perPersonBreakdown?.[0];

  const research: AttendeeResearch = {
    name: topPerson?.displayName || attendeeName,
    email: topPerson?.email || undefined,
    phone: topPerson?.phone || undefined,
    relationship,
    emailCount: contactData?.email.totalEmails || 0,
    meetingCount: contactData?.calendar.totalMeetings || 0,
    lastContact: contactData?.email.lastEmailDate || contactData?.calendar.lastMeetingDate || undefined,
    recentTopics: contactData?.email.recentSubjects || [],
  };

  // For familiar/close contacts, read recent email threads for full context
  if (relationship === 'close' || relationship === 'familiar') {
    if (contactData && contactData.email.recentSubjects.length > 0) {
      research.pendingItems = `Recent topics: ${contactData.email.recentSubjects.slice(0, 3).join(', ')}`;
    }

    // Fetch recent emails, then read the actual thread content
    // Read up to 10 unique threads from the last 60 days as an initial burst
    // The agent can always gmail_search for more if it needs deeper context
    const searchQuery = research.email ? `from:${research.email} OR to:${research.email}` : `${attendeeName}`;
    try {
      const recentEmails = await gmail.searchEmails(accessToken, `${searchQuery} newer_than:60d`, 20);
      if (recentEmails.length > 0) {
        // Deduplicate by threadId — keep up to 10 unique threads
        const allThreadIds = [...new Set(recentEmails.map(e => e.threadId))];
        const threadIdsToRead = allThreadIds.slice(0, 10);
        research.recentThreadIds = allThreadIds; // Pass all IDs so agent knows what exists

        // Actually read the threads to extract action items, attachments, links
        research.recentConversations = await readRecentThreads(accessToken, threadIdsToRead);
      }
    } catch {
      // Non-critical — agent can still gmail_search manually
    }

    if (relationship === 'close') return research;
  }

  // For new/familiar contacts: do web research
  const company = contactData ? extractCompany(contactData) : null;
  const searchName = research.name;
  const nameWithCompany = company ? `${searchName} ${company}` : searchName;

  // Pass 1: Parallel search burst
  const emptyResponse: web.WebSearchResponse = { query: '', results: [], searchTime: 0 };
  const pass1Promises: Promise<web.WebSearchResponse>[] = [
    web.webSearch(`${nameWithCompany} LinkedIn`, 5).catch(() => emptyResponse),
    web.webSearch(nameWithCompany, 5).catch(() => emptyResponse),
    web.webSearch(`${searchName} twitter OR x.com`, 3).catch(() => emptyResponse),
  ];
  if (company) {
    pass1Promises.push(
      web.webSearch(`${company} company`, 3).catch(() => emptyResponse),
    );
  }

  const pass1Results = await Promise.all(pass1Promises);
  const [linkedinResults, backgroundResults, twitterResults] = pass1Results;
  const companySearchResults = pass1Results[3];

  // Extract profile URLs from pass 1
  research.linkedinUrl = findLinkedInUrl(linkedinResults.results);
  research.twitterUrl = findTwitterUrl(twitterResults.results);

  // Extract title from search snippets (quick extraction before fetch)
  const linkedinSnippet = linkedinResults.results.find(r => r.url.includes('linkedin.com'))?.snippet || '';
  const snippetTitleMatch = linkedinSnippet.match(/(?:^|\s)[-–—]\s*(.+?)(?:\s+at\s+|\s+@\s+|$)/i)
    || linkedinSnippet.match(/(?:^|\.\s*)([A-Z][^.]+(?:Director|Manager|VP|CEO|CTO|CFO|COO|Engineer|Designer|Founder|Partner|Analyst|Consultant|Head of|Lead)[^.]*)/i);
  if (snippetTitleMatch) {
    research.title = snippetTitleMatch[1].trim().substring(0, 100);
  }

  // Build initial bio from snippets
  research.bio = buildBio(
    [...linkedinResults.results, ...backgroundResults.results],
    searchName,
  );

  // ── Pass 2: Deep-dive fetches based on pass 1 findings ──
  const pass2Promises: Promise<{ type: string; result: web.WebFetchResult | web.WebSearchResponse }>[] = [];

  // Fetch LinkedIn profile if found (the real gold)
  if (research.linkedinUrl) {
    pass2Promises.push(
      web.webFetch(research.linkedinUrl)
        .then(r => ({ type: 'linkedin_fetch' as const, result: r }))
        .catch(() => ({ type: 'linkedin_fetch', result: { url: '', title: '', content: '' } as web.WebFetchResult })),
    );
  }

  // For new contacts: fetch company page and search for news
  if (relationship === 'new') {
    // If we found a company from search results, look deeper
    const detectedCompany = company
      || (research.title?.match(/(?:at|@)\s+(.+)/i)?.[1]?.trim())
      || undefined;

    if (detectedCompany && !research.company) {
      research.company = detectedCompany;
    }

    if (research.company) {
      // Company news search
      pass2Promises.push(
        web.webSearch(`"${research.company}" news recent`, 3)
          .then(r => ({ type: 'company_news', result: r }))
          .catch(() => ({ type: 'company_news', result: emptyResponse })),
      );

      // Fetch company website if found in pass 1
      const companyUrl = companySearchResults?.results.find(r =>
        !r.url.includes('linkedin.com') && !r.url.includes('twitter.com') && !r.url.includes('wikipedia.org')
      )?.url;
      if (companyUrl) {
        pass2Promises.push(
          web.webFetch(companyUrl)
            .then(r => ({ type: 'company_fetch', result: r }))
            .catch(() => ({ type: 'company_fetch', result: { url: '', title: '', content: '' } as web.WebFetchResult })),
        );
      }
    }

    // Search for recent articles/talks by the person
    pass2Promises.push(
      web.webSearch(`${searchName} talk OR article OR interview OR podcast`, 3)
        .then(r => ({ type: 'recent_activity', result: r }))
        .catch(() => ({ type: 'recent_activity', result: emptyResponse })),
    );
  }

  // Execute pass 2 in parallel
  if (pass2Promises.length > 0) {
    const pass2Results = await Promise.all(pass2Promises);

    for (const { type, result } of pass2Results) {
      switch (type) {
        case 'linkedin_fetch': {
          const fetchResult = result as web.WebFetchResult;
          if (fetchResult.content && fetchResult.content.length > 50) {
            const linkedinInfo = extractLinkedInInfo(fetchResult);
            // Upgrade bio and title with fetched data (richer than snippets)
            if (linkedinInfo.title && !research.title) research.title = linkedinInfo.title;
            if (linkedinInfo.bio && (!research.bio || linkedinInfo.bio.length > research.bio.length)) {
              research.bio = linkedinInfo.bio;
            }
            if (linkedinInfo.company && !research.company) research.company = linkedinInfo.company;
            if (linkedinInfo.recentActivity) research.recentActivity = linkedinInfo.recentActivity;
          }
          break;
        }
        case 'company_news': {
          const searchResult = result as web.WebSearchResponse;
          if (searchResult.results.length > 0) {
            if (!research.companyInfo) {
              research.companyInfo = { description: '' };
            }
            research.companyInfo.recentNews = searchResult.results
              .slice(0, 2)
              .map(r => r.snippet)
              .filter(Boolean)
              .join(' | ')
              .substring(0, 200);
          }
          break;
        }
        case 'company_fetch': {
          const fetchResult = result as web.WebFetchResult;
          if (fetchResult.content && fetchResult.content.length > 50) {
            const info = extractCompanyInfo(fetchResult);
            if (!research.companyInfo) {
              research.companyInfo = info;
            } else {
              if (!research.companyInfo.description) research.companyInfo.description = info.description;
              if (!research.companyInfo.website) research.companyInfo.website = info.website;
            }
          }
          break;
        }
        case 'recent_activity': {
          const searchResult = result as web.WebSearchResponse;
          const activityResults = searchResult.results.filter(r =>
            !r.url.includes('linkedin.com') && !r.url.includes('twitter.com')
          );
          if (activityResults.length > 0 && !research.recentActivity) {
            research.recentActivity = activityResults
              .slice(0, 2)
              .map(r => `${r.title}: ${r.snippet?.substring(0, 80) || ''}`)
              .join(' | ')
              .substring(0, 200);
          }
          break;
        }
      }
    }
  }

  // Company info from pass 1 search (fallback if pass 2 didn't find it)
  if (company && !research.companyInfo && companySearchResults && companySearchResults.results.length > 0) {
    research.companyInfo = {
      description: companySearchResults.results[0].snippet || '',
      website: companySearchResults.results.find(r =>
        !r.url.includes('linkedin.com') && !r.url.includes('twitter.com')
      )?.url,
    };
  }

  // For familiar contacts, also include pending items
  if (relationship === 'familiar' && contactData && contactData.email.recentSubjects.length > 0) {
    research.pendingItems = `Recent topics: ${contactData.email.recentSubjects.slice(0, 3).join(', ')}`;
  }

  return research;
}

/**
 * Generate talking points based on attendee research and meeting context
 */
function generateTalkingPoints(
  meetingTitle: string,
  attendees: AttendeeResearch[],
  meetingDescription?: string,
): string[] {
  const points: string[] = [];

  // Meeting topic-based point
  if (meetingDescription) {
    points.push(`Review agenda: ${meetingDescription.substring(0, 100)}`);
  }

  // Per-attendee points
  for (const attendee of attendees) {
    if (attendee.relationship === 'new' && attendee.bio) {
      points.push(`Ask ${attendee.name} about their background${attendee.company ? ` at ${attendee.company}` : ''}`);
    } else if (attendee.pendingItems) {
      points.push(`Follow up with ${attendee.name}: ${attendee.recentTopics[0] || 'recent discussion'}`);
    }
  }

  // If we don't have enough points, add generic ones based on meeting title
  if (points.length < 2) {
    points.push(`Discuss key objectives for "${meetingTitle}"`);
  }

  return points.slice(0, 5);
}

/**
 * Collect all key links from attendee research
 */
function collectKeyLinks(attendees: AttendeeResearch[]): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];

  for (const attendee of attendees) {
    if (attendee.linkedinUrl) {
      links.push({ label: `${attendee.name} — LinkedIn`, url: attendee.linkedinUrl });
    }
    if (attendee.twitterUrl) {
      links.push({ label: `${attendee.name} — Twitter/X`, url: attendee.twitterUrl });
    }
    if (attendee.companyInfo?.website) {
      links.push({ label: `${attendee.company} — Website`, url: attendee.companyInfo.website });
    }
  }

  return links.slice(0, 10);
}

async function executeMeetingPrep(
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

  const meetingTitle = input.meeting_title as string;
  const attendees = input.attendees as string[];
  const meetingTime = input.meeting_time as string | undefined;
  const meetingDescription = input.meeting_description as string | undefined;

  if (!meetingTitle || !attendees || attendees.length === 0) {
    return {
      result: {
        success: false,
        error: 'meeting_title and at least one attendee are required.',
        retriable: false,
      },
    };
  }

  // Audit: log meeting prep request (not attendee details)
  logAuditEvent(context.userId, context.taskId, 'meeting_prep', {
    meetingTitle,
    attendeeCount: attendees.length,
  }).catch(() => {});

  try {
    // Research all attendees + search for scheduling context in parallel
    const [attendeeResearch, schedulingEmails] = await Promise.all([
      Promise.all(
        attendees.slice(0, 8).map(name =>
          researchAttendee(name, context.accessToken!, context.userEmail || '')
        )
      ),
      // Search for the email that set up this meeting
      gmail.searchEmails(
        context.accessToken!,
        `subject:"${meetingTitle.replace(/"/g, '')}" newer_than:60d`,
        3,
      ).catch(() => []),
    ]);

    // Extract scheduling context from the email that set up the meeting
    let schedulingContext: string | undefined;
    let schedulingThreadId: string | undefined;
    if (schedulingEmails.length > 0) {
      const setupEmail = schedulingEmails[0];
      schedulingThreadId = setupEmail.threadId;
      schedulingContext = `Set up by ${setupEmail.from} on ${new Date(setupEmail.date).toLocaleDateString()}: "${setupEmail.subject}"`;
    }

    const talkingPoints = generateTalkingPoints(meetingTitle, attendeeResearch, meetingDescription);
    const keyLinks = collectKeyLinks(attendeeResearch);

    const brief: MeetingPrepBrief = {
      meetingTitle,
      meetingTime,
      attendees: attendeeResearch,
      schedulingContext,
      schedulingThreadId,
      suggestedTalkingPoints: talkingPoints,
      keyLinks,
    };

    // Truncate to stay under 12000 chars (increased for conversation content)
    let result = JSON.stringify(brief);
    if (result.length > 11500) {
      // First pass: truncate conversation summaries (largest payloads)
      for (const attendee of brief.attendees) {
        if (attendee.recentConversations) {
          for (const conv of attendee.recentConversations) {
            if (conv.summary.length > 200) {
              conv.summary = conv.summary.substring(0, 200) + '...';
            }
            // Keep action items and attachments (small, high-value), trim links
            if (conv.links && conv.links.length > 3) {
              conv.links = conv.links.slice(0, 3);
            }
          }
        }
      }
      result = JSON.stringify(brief);
    }
    if (result.length > 11500) {
      // Second pass: trim bios and company info
      for (const attendee of brief.attendees) {
        if (attendee.bio && attendee.bio.length > 100) {
          attendee.bio = attendee.bio.substring(0, 100) + '...';
        }
        if (attendee.companyInfo?.description && attendee.companyInfo.description.length > 100) {
          attendee.companyInfo.description = attendee.companyInfo.description.substring(0, 100) + '...';
        }
        if (attendee.companyInfo?.recentNews && attendee.companyInfo.recentNews.length > 80) {
          attendee.companyInfo.recentNews = attendee.companyInfo.recentNews.substring(0, 80) + '...';
        }
      }
      result = JSON.stringify(brief);
    }

    // Identify gaps so the agent can do targeted follow-ups
    // Priority order: person research first, email context second, scheduling last
    const gaps: string[] = [];

    for (const attendee of attendeeResearch) {
      if (attendee.relationship === 'new') {
        // For new contacts: person research is the TOP priority
        if (attendee.linkedinUrl) {
          gaps.push(`${attendee.name}: LinkedIn found at ${attendee.linkedinUrl} — web_fetch it to extract their full career story, companies, roles`);
        } else {
          gaps.push(`${attendee.name}: no LinkedIn profile found — try web_search with different name variations to find their background`);
        }
        if (!attendee.title && !attendee.bio) {
          gaps.push(`${attendee.name}: no professional background found — web_search their full name + company or domain`);
        }
        // Search for each company mentioned to get what it does
        if (attendee.company) {
          gaps.push(`${attendee.name}: web_search "${attendee.company}" to get what it does, scale, recent news`);
        }
        gaps.push(`${attendee.name}: web_search "${attendee.name} interview OR podcast OR talk" for their thinking and interests`);
      }
      if ((attendee.relationship === 'familiar' || attendee.relationship === 'close')) {
        if (attendee.recentConversations && attendee.recentConversations.length > 0) {
          // Threads were already read — highlight what needs deeper analysis
          const hasActionItems = attendee.recentConversations.some(c => c.actionItems && c.actionItems.length > 0);
          const hasAttachments = attendee.recentConversations.some(c => c.attachments && c.attachments.length > 0);
          if (hasActionItems) {
            gaps.push(`${attendee.name}: action items found in recent threads — review and highlight which are still open/pending`);
          }
          if (hasAttachments) {
            const allAttachments = attendee.recentConversations.flatMap(c => c.attachments || []);
            gaps.push(`${attendee.name}: ${allAttachments.length} attachment(s) shared recently (${allAttachments.slice(0, 3).join(', ')}) — mention these as context for the meeting`);
          }
          // Tell agent about unread threads and high email volume
          const threadsRead = attendee.recentConversations.length;
          const totalThreads = attendee.recentThreadIds?.length || 0;
          if (totalThreads > threadsRead) {
            const unreadIds = (attendee.recentThreadIds || []).slice(threadsRead);
            gaps.push(`${attendee.name}: ${threadsRead} of ${totalThreads} recent threads read. Unread threadIds: [${unreadIds.join(', ')}] — gmail_read these if the conversations so far don't fully cover what's active`);
          }
          if (attendee.emailCount > 50 && totalThreads <= 10) {
            gaps.push(`${attendee.name}: ${attendee.emailCount} total emails but only ${totalThreads} recent threads found — gmail_search "${attendee.email || attendee.name}" with broader date range if older context needed`);
          }
        } else if (attendee.recentThreadIds && attendee.recentThreadIds.length > 0) {
          // Fallback: threads weren't read (shouldn't happen normally)
          gaps.push(`${attendee.name}: ${attendee.emailCount} emails exchanged — gmail_read threadIds [${attendee.recentThreadIds.join(', ')}] to understand recent context`);
        }
      }
    }

    // Scheduling context is low priority — just helps with "how this meeting was set up"
    if (schedulingThreadId) {
      gaps.push(`Scheduling email found (threadId: ${schedulingThreadId}) — gmail_read for a one-sentence summary of how the meeting was set up`);
    }

    return {
      result: {
        success: true,
        data: {
          ...brief,
          researchGaps: gaps.length > 0 ? gaps : undefined,
          nextSteps: gaps.length > 0
            ? 'Research gaps detected. Use web_search, web_fetch, or gmail_read to fill them before presenting the brief.'
            : 'Research is thorough. Present the brief to the user.',
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Meeting prep error:', errorMessage);
    return {
      result: {
        success: false,
        error: `Meeting prep failed: ${errorMessage}`,
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

