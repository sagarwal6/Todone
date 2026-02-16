/**
 * Gmail API Functions (Read-Only)
 *
 * Provides email operations:
 * - Search emails
 * - Read email content
 *
 * Note: We only have gmail.readonly scope. For sending/drafts,
 * use Gmail compose URLs (see lib/utils/gmail-compose.ts)
 */

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ============================================================================
// Types
// ============================================================================

export interface EmailMetadata {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  date: string;
  isUnread: boolean;
  hasAttachments: boolean;
  labelIds?: string[];  // Gmail labels for category detection
  // Raw headers for scoring layer
  rawHeaders?: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    listUnsubscribe?: string;
    inReplyTo?: string;
    references?: string;
    subject: string;
  };
  threadLength?: number;
}

export interface EmailContent extends EmailMetadata {
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  messageIdHeader?: string; // RFC 2822 Message-ID header (for reply threading)
  referencesHeader?: string; // References header (for reply threading)
  // Note: attachment download is not supported. Use hasAttachments (boolean) for metadata only.
  threadMessages?: EmailMetadata[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    parts?: { mimeType: string; body: { data?: string }; parts?: unknown[] }[];
    body?: { data?: string };
    mimeType: string;
  };
  labelIds: string[];
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

// ============================================================================
// Search Emails
// ============================================================================

export async function searchEmails(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<EmailMetadata[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(maxResults, 50)),
  });

  const response = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Gmail search failed: ${response.status} ${response.statusText}`);
  }

  const data: GmailListResponse = await response.json();

  if (!data.messages || data.messages.length === 0) {
    return [];
  }

  // Fetch metadata for each message in parallel
  const metadataPromises = data.messages.map((msg) =>
    getEmailMetadata(accessToken, msg.id)
  );

  const results = await Promise.all(metadataPromises);
  return results.filter((r): r is EmailMetadata => r !== null);
}

async function getEmailMetadata(
  accessToken: string,
  messageId: string
): Promise<EmailMetadata | null> {
  // Gmail API requires metadataHeaders as repeated params, not comma-separated
  const params = new URLSearchParams();
  params.set('format', 'metadata');
  const headersToFetch = ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Reply-To', 'List-Unsubscribe', 'In-Reply-To', 'References'];
  headersToFetch.forEach(h => params.append('metadataHeaders', h));

  const response = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to get email ${messageId}: ${response.status}`);
    return null;
  }

  const message: GmailMessage = await response.json();

  return parseEmailMetadata(message);
}

// ============================================================================
// Read Email
// ============================================================================

export async function readEmail(
  accessToken: string,
  emailId: string,
  includeThread: boolean = true
): Promise<EmailContent> {
  const response = await fetch(`${GMAIL_API_BASE}/messages/${emailId}?format=full`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to read email: ${response.status} ${response.statusText}`);
  }

  const message: GmailMessage = await response.json();
  const email = parseEmailContent(message);

  // Get thread messages if requested
  if (includeThread && message.threadId) {
    const threadResponse = await fetch(
      `${GMAIL_API_BASE}/threads/${message.threadId}?format=metadata`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (threadResponse.ok) {
      const thread = await threadResponse.json();
      email.threadMessages = thread.messages
        .filter((m: GmailMessage) => m.id !== emailId)
        .map(parseEmailMetadata);
    }
  }

  return email;
}


// ============================================================================
// Helper Functions
// ============================================================================

function parseEmailMetadata(message: GmailMessage): EmailMetadata {
  const headers = message.payload?.headers || [];

  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const toHeader = getHeader('To');
  const ccHeader = getHeader('Cc');
  const fromHeader = getHeader('From');
  const subjectHeader = getHeader('Subject');

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || '',
    from: fromHeader,
    to: toHeader ? toHeader.split(',').map((e) => e.trim()) : [],
    cc: ccHeader ? ccHeader.split(',').map((e) => e.trim()) : undefined,
    subject: subjectHeader,
    date: getHeader('Date'),
    isUnread: message.labelIds?.includes('UNREAD') || false,
    hasAttachments: message.payload ? hasAttachments(message.payload) : false,
    labelIds: message.labelIds || [],  // Include labels for category-based scoring
    // Include raw headers for scoring layer
    rawHeaders: {
      from: fromHeader,
      to: toHeader,
      cc: ccHeader || undefined,
      bcc: getHeader('Bcc') || undefined,
      replyTo: getHeader('Reply-To') || undefined,
      listUnsubscribe: getHeader('List-Unsubscribe') || undefined,
      inReplyTo: getHeader('In-Reply-To') || undefined,
      references: getHeader('References') || undefined,
      subject: subjectHeader,
    },
  };
}

function parseEmailContent(message: GmailMessage): EmailContent {
  const metadata = parseEmailMetadata(message);
  const headers = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  // Truncate email bodies to prevent token explosion (max ~2000 chars)
  const MAX_BODY_LENGTH = 2000;
  let body = message.payload ? extractTextBody(message.payload) : '';
  if (body.length > MAX_BODY_LENGTH) {
    body = body.substring(0, MAX_BODY_LENGTH) + '\n... [email truncated]';
  }

  return {
    ...metadata,
    cc: getHeader('Cc') ? getHeader('Cc').split(',').map((e) => e.trim()) : undefined,
    bcc: getHeader('Bcc') ? getHeader('Bcc').split(',').map((e) => e.trim()) : undefined,
    messageIdHeader: getHeader('Message-ID') || getHeader('Message-Id') || undefined, // For reply threading
    referencesHeader: getHeader('References') || undefined, // For reply threading
    body,
    htmlBody: undefined, // Don't include HTML to save tokens
  };
}

function extractTextBody(payload: GmailMessage['payload']): string {
  // Check for plain text in body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Check parts for text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Recursively check nested parts
      if (part.parts) {
        const nestedPayload = { ...payload, parts: part.parts as typeof payload.parts };
        const text = extractTextBody(nestedPayload);
        if (text) return text;
      }
    }
  }

  return '';
}

function extractHtmlBody(payload: GmailMessage['payload']): string | undefined {
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
  }
  return undefined;
}

function hasAttachments(payload: GmailMessage['payload']): boolean {
  if (payload.parts) {
    return payload.parts.some(
      (part) =>
        part.mimeType !== 'text/plain' &&
        part.mimeType !== 'text/html' &&
        !part.mimeType.startsWith('multipart/')
    );
  }
  return false;
}

function decodeBase64Url(data: string): string {
  // Replace URL-safe characters
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Decode
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

// ============================================================================
// Paginated Search (for Insight Scan)
// ============================================================================

interface FetchWithRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
}

/**
 * Fetch with exponential backoff for rate limiting
 */
async function fetchWithRetry(
  url: string,
  accessToken: string,
  options: FetchWithRetryOptions
): Promise<Response> {
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) return response;

    // Rate limited - retry with backoff
    if (response.status === 429 && attempt < options.maxRetries) {
      const delay = options.baseDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
  }

  throw new Error('Max retries exceeded');
}

/**
 * Get email metadata with retry support
 */
async function getEmailMetadataWithRetry(
  accessToken: string,
  messageId: string
): Promise<EmailMetadata | null> {
  // Gmail API requires metadataHeaders as repeated params, not comma-separated
  const params = new URLSearchParams();
  params.set('format', 'metadata');
  const headersToFetch = ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Reply-To', 'List-Unsubscribe', 'In-Reply-To', 'References'];
  headersToFetch.forEach(h => params.append('metadataHeaders', h));

  try {
    const response = await fetchWithRetry(
      `${GMAIL_API_BASE}/messages/${messageId}?${params}`,
      accessToken,
      { maxRetries: 2, baseDelayMs: 500 }
    );

    const message: GmailMessage = await response.json();

    return parseEmailMetadata(message);
  } catch (error) {
    console.error(`Failed to get email ${messageId}:`, error);
    return null;
  }
}

/**
 * Paginated search with retry and rate limiting
 * Used for Insight Scan to fetch up to 300 emails
 */
export async function searchEmailsPaginated(
  accessToken: string,
  query: string,
  maxResults: number = 300,
  onProgress?: (count: number) => void
): Promise<EmailMetadata[]> {
  const allEmails: EmailMetadata[] = [];
  let pageToken: string | undefined;
  const perPage = 50; // Gmail max per request

  while (allEmails.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(perPage, maxResults - allEmails.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetchWithRetry(
      `${GMAIL_API_BASE}/messages?${params}`,
      accessToken,
      { maxRetries: 3, baseDelayMs: 1000 }
    );

    const data: GmailListResponse = await response.json();
    if (!data.messages || data.messages.length === 0) break;

    // Fetch metadata in parallel (batches of 10 to avoid rate limits)
    const batchSize = 10;
    for (let i = 0; i < data.messages.length; i += batchSize) {
      const batch = data.messages.slice(i, i + batchSize);
      const metadataPromises = batch.map((m) =>
        getEmailMetadataWithRetry(accessToken, m.id)
      );
      const metadata = await Promise.all(metadataPromises);
      const validMetadata = metadata.filter((m): m is EmailMetadata => m !== null);
      allEmails.push(...validMetadata);

      // Report progress
      if (onProgress) {
        onProgress(allEmails.length);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return allEmails;
}

/**
 * Get sent emails for follow-up detection
 * Used by Insight Scan to find emails we sent that haven't received a reply
 */
export async function getSentEmails(
  accessToken: string,
  days: number = 14,
  maxResults: number = 100
): Promise<EmailMetadata[]> {
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - days);
  const query = `from:me after:${afterDate.toISOString().split('T')[0]}`;

  return searchEmailsPaginated(accessToken, query, maxResults);
}

/**
 * Get thread details to check for replies
 */
export async function getThreadInfo(
  accessToken: string,
  threadId: string
): Promise<{ messageCount: number; lastMessageFrom: string; lastMessageDate: string } | null> {
  try {
    const response = await fetchWithRetry(
      `${GMAIL_API_BASE}/threads/${threadId}?format=metadata&metadataHeaders=From,Date`,
      accessToken,
      { maxRetries: 2, baseDelayMs: 500 }
    );

    const thread = await response.json();
    if (!thread.messages || thread.messages.length === 0) return null;

    const lastMessage = thread.messages[thread.messages.length - 1];
    const headers = lastMessage.payload?.headers || [];
    const fromHeader = headers.find((h: { name: string }) => h.name.toLowerCase() === 'from')?.value || '';
    const dateHeader = headers.find((h: { name: string }) => h.name.toLowerCase() === 'date')?.value || '';

    return {
      messageCount: thread.messages.length,
      lastMessageFrom: fromHeader,
      lastMessageDate: dateHeader,
    };
  } catch (error) {
    console.error(`Failed to get thread ${threadId}:`, error);
    return null;
  }
}

/**
 * Create draft stub - Gmail API is read-only in this app
 * Drafts are opened via compose URL instead of being created via API
 */
export async function createDraft(
  _accessToken: string,
  _draft: { to: string | string[]; subject: string; body: string; threadId?: string; cc?: string[]; bcc?: string[] }
): Promise<{ id: string; composeUrl: string }> {
  throw new Error(
    'Gmail write access is not available. Use the compose URL to create drafts instead.'
  );
}
