/**
 * Gmail Compose URL Utilities
 *
 * Since we only have gmail.readonly scope, we can't create drafts via API.
 * Instead, we generate Gmail compose URLs that open Gmail with pre-filled content.
 *
 * Supports:
 * - Web: Opens Gmail compose in new tab
 * - Mobile: Opens Gmail app if installed (via deep link)
 */

import type { EmailDraft } from '@/lib/ai/types';

/**
 * Generate a Gmail reply URL that opens compose with pre-filled content.
 * This is used for the "write myself" and "draft for me" flows where
 * we want to open Gmail with the draft ready to send.
 *
 * @param to - Recipient email address(es)
 * @param subject - Email subject (should include Re: for replies)
 * @param body - The draft body text
 * @param userEmail - User's email for multi-account support
 */
export function generateGmailReplyUrl(
  to: string | string[],
  subject: string,
  body: string,
  userEmail?: string
): string {
  const params = new URLSearchParams();

  // Recipients
  const recipients = Array.isArray(to) ? to.join(',') : to;
  params.set('to', recipients);

  // Subject (ensure Re: prefix for replies)
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  params.set('su', replySubject);

  // Body - truncate if too long (URL length limit ~2000 chars)
  const maxBodyLength = 1500;
  const truncatedBody = body.length > maxBodyLength
    ? body.substring(0, maxBodyLength) + '\n\n[Draft truncated - continue in Gmail]'
    : body;
  params.set('body', truncatedBody);

  // Use user email for multi-account support
  const account = userEmail ? `u/${encodeURIComponent(userEmail)}` : 'u/0';

  return `https://mail.google.com/mail/${account}/?view=cm&fs=1&tf=1&${params.toString()}`;
}

/**
 * Open Gmail reply compose in a new tab.
 */
export function openGmailReply(
  to: string | string[],
  subject: string,
  body: string,
  userEmail?: string
): void {
  const url = generateGmailReplyUrl(to, subject, body, userEmail);

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Generate a Gmail compose URL with pre-filled email content.
 * Works on web and redirects to Gmail app on mobile if installed.
 */
export function generateGmailComposeUrl(draft: EmailDraft): string {
  const params = new URLSearchParams();

  // Recipients
  if (draft.to.length > 0) {
    params.set('to', draft.to.join(','));
  }
  if (draft.cc && draft.cc.length > 0) {
    params.set('cc', draft.cc.join(','));
  }
  if (draft.bcc && draft.bcc.length > 0) {
    params.set('bcc', draft.bcc.join(','));
  }

  // Subject
  if (draft.subject) {
    params.set('su', draft.subject);
  }

  // Body - truncate if too long (URL length limit ~2000 chars)
  if (draft.body) {
    const maxBodyLength = 1500; // Leave room for other params
    const body = draft.body.length > maxBodyLength
      ? draft.body.substring(0, maxBodyLength) + '\n\n[Draft truncated - continue in Gmail]'
      : draft.body;
    params.set('body', body);
  }

  // Gmail compose URL format
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&${params.toString()}`;
}

/**
 * Generate a Gmail app deep link for mobile devices.
 * Falls back to web URL if not on mobile.
 */
export function generateGmailDeepLink(draft: EmailDraft): string {
  const params = new URLSearchParams();

  if (draft.to.length > 0) {
    params.set('to', draft.to.join(','));
  }
  if (draft.subject) {
    params.set('subject', draft.subject);
  }
  if (draft.body) {
    const maxBodyLength = 1500;
    const body = draft.body.length > maxBodyLength
      ? draft.body.substring(0, maxBodyLength) + '\n\n[Draft truncated]'
      : draft.body;
    params.set('body', body);
  }

  // Gmail app deep link (works on iOS and Android)
  return `googlegmail://co?${params.toString()}`;
}

/**
 * Open Gmail compose with the draft content.
 * Attempts deep link on mobile, falls back to web URL.
 */
export function openGmailCompose(draft: EmailDraft): void {
  const webUrl = generateGmailComposeUrl(draft);

  // On mobile, try the deep link first
  if (typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    const deepLink = generateGmailDeepLink(draft);

    // Try to open the app, fall back to web after a short delay
    const fallbackTimeout = setTimeout(() => {
      window.open(webUrl, '_blank');
    }, 500);

    // If the app opens, this will be cancelled
    window.location.href = deepLink;

    // Clear timeout if we're still here (app didn't open)
    window.addEventListener('blur', () => clearTimeout(fallbackTimeout), { once: true });
  } else {
    // Desktop - just open the web URL
    window.open(webUrl, '_blank');
  }
}

/**
 * Generate a Google Calendar event creation URL.
 * Since we only have calendar.readonly, we can't create events via API.
 */
export function generateCalendarEventUrl(event: {
  title: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  location?: string;
  attendees?: string[];
}): string {
  const params = new URLSearchParams();

  // Action: create event
  params.set('action', 'TEMPLATE');

  // Event details
  params.set('text', event.title);

  if (event.description) {
    params.set('details', event.description);
  }

  if (event.location) {
    params.set('location', event.location);
  }

  // Date/time format: YYYYMMDDTHHmmssZ
  if (event.startTime) {
    const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    params.set('dates', `${formatDate(event.startTime)}/${formatDate(event.endTime || new Date(event.startTime.getTime() + 60 * 60 * 1000))}`);
  }

  // Attendees (comma-separated emails)
  if (event.attendees && event.attendees.length > 0) {
    params.set('add', event.attendees.join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
