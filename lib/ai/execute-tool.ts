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
import * as contacts from '../google/contacts';
// Import web utilities
import * as web from './web';
// Import email scoring
import { scoreEmails, getTierSummary } from '../email/scoring';
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
    .replace(/(?:date\s+of\s+birth|dob|born|birthday)\s*:?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/gi, '[DOB REDACTED]')
    .replace(/(?:date\s+of\s+birth|dob|born|birthday)\s*:?\s*\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/gi, '[DOB REDACTED]')
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
      ? combineAbortSignals(context.abortSignal, timeoutController.signal)
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

    // Contacts tool
    case 'contacts_search':
      return executeContactsSearch(input, context);

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
  const maxResults = (input.max_results as number) || 10;

  try {
    console.log('Gmail search: Starting with query:', query);

    const emails = await gmail.searchEmails(context.accessToken, query, maxResults);

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
              // Present emails grouped by priority to help LLM prioritize
              priorityEmails: {
                high: highPriority,
                medium: mediumPriority,
                low: lowPriority,
              },
              tierSummary,
              totalCount: emails.length,
              skippedCount: skipped.length,
              hasResults: highPriority.length > 0 || mediumPriority.length > 0 || lowPriority.length > 0,
              // Include note about scoring
              scoringNote: 'Emails are pre-scored for priority. HIGH tier emails are direct 1:1 messages to the user and should be mentioned first. LOW tier and skipped emails are bulk/automated and can be summarized briefly.',
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

  const timeMin = input.time_min as string | undefined;
  const timeMax = input.time_max as string | undefined;
  const maxResults = (input.max_results as number) || 20;
  const calendarId = (input.calendar_id as string) || 'primary';

  const events = await calendar.listEvents(context.accessToken, {
    timeMin,
    timeMax,
    maxResults,
    calendarId,
  });

  return {
    result: {
      success: true,
      data: {
        events,
        count: events.length,
        hasResults: events.length > 0,
      },
    },
  };
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

/**
 * Combine multiple abort signals
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}
