/**
 * Agentic Tool Definitions
 *
 * Tools are defined with proper JSON Schema format and rich descriptions
 * following Anthropic's tool engineering best practices.
 */

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

/**
 * Gmail Search Tool
 * Search user's Gmail inbox with advanced query syntax
 */
export const gmailSearchTool: Tool = {
  name: 'gmail_search',
  description: `Search Gmail inbox. Prioritize recent emails: start with newer_than:6m, broaden only if needed. Translate user intent to Gmail operators — don't use their exact words as the query. For email triage ("what needs attention?"): search in:inbox newer_than:1d for today, then is:unread newer_than:5d for unanswered. Results are pre-scored: HIGH = direct 1:1 (mention first), MEDIUM = relevant, LOW/skip = bulk. Supports: from:, to:, subject:, in:inbox, is:unread, has:attachment, newer_than:, after:, before:.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query using Gmail operators. Examples: "from:jane@company.com", "subject:invoice newer_than:7d", "in:inbox from:john". Use "in:inbox" when searching received emails. Do NOT add is:unread unless specifically asked - search all emails (read and unread) by default.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of emails to return (1-50). Default: 10',
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['query'],
  },
};

/**
 * Gmail Read Tool
 * Read full content of a specific email
 */
export const gmailReadTool: Tool = {
  name: 'gmail_read',
  description: `Read full email content by ID. Returns body, headers, and thread context. Use after gmail_search.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      email_id: {
        type: 'string',
        description: 'The Gmail message ID from gmail_search results',
      },
      include_thread: {
        type: 'boolean',
        description: 'Whether to include other messages in the same thread. Default: true',
      },
    },
    required: ['email_id'],
  },
};

/**
 * Gmail Draft Tool
 * Create an email draft (requires user confirmation before sending)
 */
export const gmailDraftTool: Tool = {
  name: 'gmail_draft',
  description: `Create email draft for user review (NOT sent automatically). Use for formal, detailed, or group communications — NOT for casual "message/text someone" tasks (use sms: link instead). Keep drafts SHORT and direct — 1-2 sentences max for quick messages. No corporate filler ("Thanks for your patience!", "I hope this email finds you well"). No sign-off unless it's a formal email. For replies: MUST include thread_id, message_id (from gmail_read), and original_email to thread properly.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      to: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of recipient email addresses',
      },
      cc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of CC recipient email addresses (optional)',
      },
      bcc: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of BCC recipient email addresses (optional)',
      },
      subject: {
        type: 'string',
        description: 'Email subject line (for replies, use "Re: [original subject]")',
      },
      body: {
        type: 'string',
        description: 'Email body content (plain text, will be formatted)',
      },
      thread_id: {
        type: 'string',
        description: 'Gmail thread ID (REQUIRED for replies - get from gmail_read)',
      },
      message_id: {
        type: 'string',
        description: 'Message-ID header of the email being replied to (REQUIRED for replies - get from gmail_read messageId field)',
      },
      references: {
        type: 'string',
        description: 'References header from the original email (optional, for proper threading)',
      },
      original_email: {
        type: 'object',
        description: 'The original email being replied to (REQUIRED for replies so user can review in context)',
        properties: {
          from: { type: 'string', description: 'Sender email address' },
          from_name: { type: 'string', description: 'Sender display name' },
          subject: { type: 'string', description: 'Original subject line' },
          body: { type: 'string', description: 'Original email body text' },
          date: { type: 'string', description: 'When the original email was sent' },
        },
        required: ['from', 'subject', 'body'],
      },
    },
    required: ['to', 'subject', 'body'],
  },
};

/**
 * Calendar List Tool
 * List upcoming calendar events
 */
export const calendarListTool: Tool = {
  name: 'calendar_list',
  description: `List calendar events. Default: next 7 days. For patterns/recurring ("do I meet with X regularly?"): search last 90 days. For free slots: search just that day. All-day events (birthdays, holidays) are informational — they don't block time. When checking availability, only count events with specific start/end times. Also useful for disambiguation: if user says "message Andrew" and has a meeting with an Andrew today, that's likely who they mean.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      time_min: {
        type: 'string',
        description: 'Start of time range (ISO 8601). Default: now',
      },
      time_max: {
        type: 'string',
        description: 'End of time range (ISO 8601). Default: 7 days from now',
      },
      max_results: {
        type: 'number',
        description: 'Maximum events to return (1-50). Default: 20',
        minimum: 1,
        maximum: 50,
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID to search. Default: primary calendar',
      },
    },
    required: [],
  },
};

/**
 * Calendar Create Event Tool
 * Create a calendar event draft (requires user confirmation)
 */
export const calendarCreateTool: Tool = {
  name: 'calendar_create',
  description: `Create calendar event draft for user review (NOT created automatically). Use ISO 8601 times. User must confirm.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'Event title',
      },
      description: {
        type: 'string',
        description: 'Event description/agenda (optional)',
      },
      start_time: {
        type: 'string',
        description: 'Start time in ISO 8601 format with timezone',
      },
      end_time: {
        type: 'string',
        description: 'End time in ISO 8601 format with timezone',
      },
      timezone: {
        type: 'string',
        description: 'Timezone for the event. Example: "America/Los_Angeles". Default: user\'s timezone',
      },
      location: {
        type: 'string',
        description: 'Event location (optional)',
      },
      attendees: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            displayName: { type: 'string' },
          },
          required: ['email'],
        },
        description: 'List of attendees with email and optional displayName',
      },
    },
    required: ['summary', 'start_time', 'end_time'],
  },
};

/**
 * Contacts Search Tool
 * Search user's Google Contacts
 */
export const contactsSearchTool: Tool = {
  name: 'contacts_search',
  description: `Search Google Contacts by name/email. Returns name, emails, phone numbers, organization. For "message/text X": look up phone and provide sms: link. For "call X": provide tel: link. If multiple matches for a name, use calendar_list (meeting today?) and gmail_search (recent activity) to disambiguate — show ranked list with context, don't pre-select.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query (name or email). Example: "John Smith" or "john@"',
      },
      max_results: {
        type: 'number',
        description: 'Maximum contacts to return (1-20). Default: 10',
        minimum: 1,
        maximum: 20,
      },
    },
    required: ['query'],
  },
};

/**
 * Contacts Analyze Tool
 * Analyze relationship history with a contact across email and calendar
 */
export const contactsAnalyzeTool: Tool = {
  name: 'contacts_analyze',
  description: `Analyze the user's relationship with a person over the past year. Returns perPersonBreakdown: each person has email count, meeting count, last contact date, relationship strength, AND phone number (from Google Contacts). Sorted by activity. For "message/text X": filter perPersonBreakdown to entries with a phone number, pick top 3 by strength. For "do I meet with X?": use meeting count and pattern. This one tool gives you everything — no need to also call contacts_search.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Person name or email to analyze. For disambiguation, call this once per candidate. Examples: "Andrew", "jane@company.com"',
      },
    },
    required: ['query'],
  },
};

/**
 * Web Search Tool
 * Search the web for current information
 */
export const webSearchTool: Tool = {
  name: 'web_search',
  description: `Search the web for current information. Returns title, URL, snippet. Use web_fetch for full page content.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query. Be specific and include relevant context.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum results to return (1-10). Default: 5',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
  },
};

/**
 * Web Fetch Tool
 * Fetch and read content from a specific URL
 */
export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: `Fetch full webpage content from a URL. Returns title, cleaned content, publication date.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to fetch (must start with http:// or https://)',
      },
    },
    required: ['url'],
  },
  // Cache breakpoint on last tool — caches all tool definitions (static across iterations)
  cache_control: { type: 'ephemeral' },
} as Tool;

/**
 * All available tools for the agentic loop
 */
export const agenticTools: Tool[] = [
  gmailSearchTool,
  gmailReadTool,
  gmailDraftTool,
  calendarListTool,
  calendarCreateTool,
  contactsSearchTool,
  contactsAnalyzeTool,
  webSearchTool,
  webFetchTool,
];

/**
 * Tools that require user confirmation (write actions)
 */
export const CONFIRMATION_REQUIRED_TOOLS = new Set([
  'gmail_draft',
  'calendar_create',
]);

/**
 * Tools that are read-only (no side effects)
 */
export const READ_ONLY_TOOLS = new Set([
  'gmail_search',
  'gmail_read',
  'calendar_list',
  'contacts_search',
  'contacts_analyze',
  'web_search',
  'web_fetch',
]);

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): Tool | undefined {
  return agenticTools.find((t) => t.name === name);
}

/**
 * Check if a tool requires user confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  return CONFIRMATION_REQUIRED_TOOLS.has(toolName);
}
