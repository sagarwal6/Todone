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
  description: `Search Gmail inbox for specific person/topic queries. For broad triage ("what needs my attention", "check my inbox"), use gmail_triage instead — it searches, scores, and previews top threads in one call. Results are automatically scored by priority: HIGH = direct 1:1 messages (mention first), MEDIUM = relevant. Bulk/newsletters are filtered out — only actionable emails are returned. Each result includes a threadId — always build Gmail links so users can tap to open: [Subject](https://mail.google.com/mail/u/0/#inbox/THREAD_ID). Search as many times as needed to fully answer the question. For person + topic searches (e.g., "email from Tim about working together"): search recent first ("from:tim newer_than:2y"), then read promising threads. Topic words are hints — the person may have used different phrasing, so don't require exact keyword matches in the query. If the first search only returns old results, broaden or try without topic keywords. Present like a CEO briefing — only items needing a response or decision. Translate user intent to Gmail operators. Supports: from:, to:, subject:, in:inbox, is:unread, has:attachment, newer_than:, after:, before:.`,
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
  description: `Create email draft for user review (NOT sent automatically). The "to" field MUST use a verified email address from contacts, email history, or calendar attendee data — NEVER guess or construct an email from someone's name. Style and tone come from tone_analyze — follow its recommendation for greeting, sign-off, capitalization, and spacing. After creating a draft, do NOT repeat the subject/to/body in your response — the draft card displays them. Just confirm it was created in one line. For replies: MUST include thread_id, message_id (from gmail_read), and original_email to thread properly.`,
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
  description: `List calendar events. Each event includes a dayOfWeek field (e.g. "Sunday") — always use it instead of computing the day yourself. Choose time_min and time_max based on what the task needs — lean toward broader ranges and higher max_results to avoid missing data. For time ranges ≥30 days, the response includes a recurringMeetings array with pre-analyzed patterns (title, cadence, days, attendees) — use this for "who do I meet with regularly" type questions. For free slots: search just that day. All-day events (birthdays, holidays) are informational — they don't block time. When checking availability, only count events with specific start/end times. Also useful for disambiguation: if user says "message Andrew" and has a meeting with an Andrew today, that's likely who they mean.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      time_min: {
        type: 'string',
        description: 'Start of time range (ISO 8601). Set based on what the task needs — go back months/years for pattern analysis.',
      },
      time_max: {
        type: 'string',
        description: 'End of time range (ISO 8601). Include future events when relevant (upcoming meetings, recurring events).',
      },
      max_results: {
        type: 'number',
        description: 'Maximum events to return (1-500). Use higher values for broader searches to avoid missing data.',
        minimum: 1,
        maximum: 500,
      },
      calendar_id: {
        type: 'string',
        description: 'Calendar ID to search. Default: primary calendar',
      },
      q: {
        type: 'string',
        description: 'Free-text search filter — matches event title, description, location, and attendee names. Use to find specific recurring events.',
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
export const toneAnalyzeTool: Tool = {
  name: 'tone_analyze',
  description: `Analyze how the user writes emails to a specific person (or in general). Returns recent sent email samples and style signals (greeting, sign-off, formality, length). Call this BEFORE gmail_draft when replying to someone — match the user's natural voice. If recipient_email is provided, analyzes emails to that person; otherwise analyzes the user's general email style. Skip for very first emails to new contacts (no history to match).`,
  input_schema: {
    type: 'object' as const,
    properties: {
      recipient_email: {
        type: 'string',
        description: 'Email address to analyze style for (optional — omit for general style)',
      },
    },
    required: [],
  },
};

export const contactsAnalyzeTool: Tool = {
  name: 'contacts_analyze',
  description: `Analyze the user's relationship with a person over the past year (email + calendar, 1 year back and 1 year forward). Returns perPersonBreakdown: each person has email count, meeting count, last contact date, relationship strength, AND phone number (from Google Contacts). Sorted by activity. For "message/text X": cross-reference with calendar_list first — if there's a meeting with a specific person soon, use THAT person's full name or email to look up contact info (call contacts_search if needed). Don't assume the top result from a first-name search is the right person.`,
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
};

/**
 * Gmail Triage Tool
 * Compound tool: search + score + preview top threads in one call
 */
export const gmailTriageTool: Tool = {
  name: 'gmail_triage',
  description: `Triage inbox — search, score, and preview top emails in one call. Returns scored HIGH-priority emails with full thread previews for the top results. Use for "what needs my attention", "check my inbox", "any urgent emails" type queries. For specific person/topic searches, use gmail_search instead.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query. Defaults to broad inbox triage (in:inbox newer_than:3d) if not specified.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum emails to search. Default: 30',
        minimum: 1,
        maximum: 50,
      },
      preview_count: {
        type: 'number',
        description: 'How many top HIGH-priority threads to read in full. Default: 3',
        minimum: 1,
        maximum: 10,
      },
    },
    required: [],
  },
};

/**
 * Meeting Prep Tool
 * Research attendees and prepare a comprehensive meeting brief
 */
export const meetingPrepTool: Tool = {
  name: 'meeting_prep',
  description: `Research attendees and prepare a comprehensive meeting brief. Use when user asks to prep for a meeting, or when preparing for an upcoming calendar event. Does parallel deep research per attendee: contacts_analyze for relationship history + multi-pass web searches (LinkedIn, company, news, articles). Returns structured brief per attendee with relationship strength, communication history, professional background, and key links. IMPORTANT: For FAMILIAR/CLOSE contacts, the tool reads up to 10 recent email threads and extracts: conversation summaries, action items, attachments (filenames), and links shared. This data is in the "recentConversations" field — synthesize it into the brief. The "recentThreadIds" field contains ALL thread IDs found — if more threads exist than were read, use gmail_read to read additional ones as needed. After calling this tool, review the results and adapt your follow-up research: (1) For FAMILIAR contacts: the recentConversations data IS the prep — synthesize action items, highlight shared attachments/links, identify what's pending. If the researchGaps mention unread threads, read them to get fuller context. (2) For NEW contacts: web_search each notable org/company/project for a 1-sentence description; search for recent talks or articles by the person. (3) The "researchGaps" field lists specific missing info to fill. Include clickable links throughout. Keep iterating until the brief has enough texture for the user to walk in fully prepared.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      meeting_title: {
        type: 'string',
        description: 'The title of the meeting',
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names or email addresses of meeting attendees (excluding the user)',
      },
      meeting_time: {
        type: 'string',
        description: 'ISO 8601 datetime of the meeting (optional)',
      },
      meeting_description: {
        type: 'string',
        description: 'Meeting description or agenda if available (optional)',
      },
      focus_areas: {
        type: 'string',
        description: 'Specific topics to research or focus on (optional)',
      },
    },
    required: ['meeting_title', 'attendees'],
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
  gmailTriageTool,
  toneAnalyzeTool,
  calendarListTool,
  calendarCreateTool,
  contactsSearchTool,
  contactsAnalyzeTool,
  webSearchTool,
  webFetchTool,
  meetingPrepTool,
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
  'gmail_triage',
  'tone_analyze',
  'calendar_list',
  'contacts_search',
  'contacts_analyze',
  'web_search',
  'web_fetch',
  'meeting_prep',
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
