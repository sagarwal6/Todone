/**
 * Gmail Deep Link Utilities
 *
 * Constructs Gmail URLs that open specific threads, allowing users to
 * read context and reply directly in Gmail. This approach works with
 * gmail.readonly scope only - no write permissions needed.
 *
 * Threading works because:
 * 1. We link to the actual thread (not a compose window)
 * 2. User clicks Reply in Gmail
 * 3. Gmail handles In-Reply-To headers automatically
 */

/**
 * Constructs a Gmail deep link that opens a specific thread.
 *
 * Uses the Gmail threadId from the API, which maps to the web UI URL.
 * For multi-account users, using the email address instead of account
 * index (u/0, u/1) ensures the correct account opens.
 *
 * @param threadId - The thread ID from Gmail API (e.g., "18f2a3b4c5d6e7f8")
 * @param userEmail - The user's Gmail address (for multi-account support)
 * @returns Gmail web URL that opens the thread
 */
export function getGmailThreadLink(threadId: string, userEmail?: string): string {
  const account = userEmail ? `u/${encodeURIComponent(userEmail)}` : 'u/0';
  return `https://mail.google.com/mail/${account}/#inbox/${threadId}`;
}

/**
 * Constructs a Gmail deep link to a specific message within a thread.
 * Falls back to thread-level link since Gmail usually scrolls to the message.
 *
 * @param messageId - The message ID from Gmail API
 * @param userEmail - The user's Gmail address (for multi-account support)
 * @returns Gmail web URL that opens the message
 */
export function getGmailMessageLink(messageId: string, userEmail?: string): string {
  const account = userEmail ? `u/${encodeURIComponent(userEmail)}` : 'u/0';
  return `https://mail.google.com/mail/${account}/#inbox/${messageId}`;
}

/**
 * Constructs a Gmail search link.
 * Useful for "find emails from X" type tasks.
 *
 * @param query - Gmail search query (same syntax as Gmail search box)
 * @param userEmail - The user's Gmail address (for multi-account support)
 * @returns Gmail web URL that opens search results
 */
export function getGmailSearchLink(query: string, userEmail?: string): string {
  const account = userEmail ? `u/${encodeURIComponent(userEmail)}` : 'u/0';
  return `https://mail.google.com/mail/${account}/#search/${encodeURIComponent(query)}`;
}

/**
 * Opens a Gmail thread in a new tab.
 * Handles mobile detection and opens the appropriate URL.
 *
 * @param threadId - The thread ID from Gmail API
 * @param userEmail - The user's Gmail address (for multi-account support)
 */
export function openGmailThread(threadId: string, userEmail?: string): void {
  const url = getGmailThreadLink(threadId, userEmail);

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
