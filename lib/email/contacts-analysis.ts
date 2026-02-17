/**
 * Contact Relationship Analysis
 *
 * Analyzes email and calendar history to build relationship profiles.
 * Used by the contacts_analyze tool to give the agent context about
 * who a person is relative to the user — frequency, recency, direction,
 * meeting patterns.
 */

import { searchEmails } from '../google/gmail';
import { listEvents } from '../google/calendar';
import { searchContacts } from '../google/contacts';
import type { EmailMetadata } from '../google/gmail';
import type { CalendarEvent } from '../google/calendar';
import { isAutomatedSender, extractEmailAddress } from './scoring-utils';

// ============================================================================
// Types
// ============================================================================

/** Per-person breakdown when multiple contacts match a query */
export interface PersonBreakdown {
  email: string;
  displayName: string;
  phone: string | null;
  emailCount: number;
  fromThem: number;
  toThem: number;
  lastEmailDate: string | null;
  meetingCount: number;
  lastMeetingDate: string | null;
  strength: 'high' | 'medium' | 'low' | 'none';
}

export interface ContactRelationship {
  query: string;
  /** Per-person breakdown sorted by activity (most active first). Use this to rank contacts. */
  perPersonBreakdown: PersonBreakdown[];
  email: {
    totalEmails: number;
    fromThem: number;
    toThem: number;
    lastEmailDate: string | null;
    lastEmailSubject: string | null;
    /** Approximate emails per month over the analysis period */
    frequencyPerMonth: number;
    /** Who initiates more: "them", "user", or "balanced" */
    initiator: 'them' | 'user' | 'balanced';
    /** Recent email subjects (last 5) for topic context */
    recentSubjects: string[];
    /** Unique email addresses found matching the query */
    matchedEmails: string[];
  };
  calendar: {
    totalMeetings: number;
    upcomingMeetings: number;
    lastMeetingDate: string | null;
    lastMeetingSummary: string | null;
    nextMeetingDate: string | null;
    nextMeetingSummary: string | null;
    /** Approximate meetings per month */
    frequencyPerMonth: number;
    /** Detected pattern if any: "weekly on Tuesdays", "biweekly", etc. */
    pattern: string | null;
  };
  /** Overall relationship strength: high (weekly+), medium (monthly), low (rare), none */
  strength: 'high' | 'medium' | 'low' | 'none';
  /** One-line summary for the agent */
  summary: string;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze the user's relationship with a contact over the past year.
 * Combines email frequency/recency with calendar meeting patterns.
 */
export async function analyzeContactRelationship(
  accessToken: string,
  query: string,
  _userEmail: string,
): Promise<ContactRelationship> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Run email, calendar, and contacts queries in parallel
  const [emailsFrom, emailsTo, calendarEvents, contactsResults] = await Promise.all([
    // Emails FROM the contact to user (last year)
    searchEmails(accessToken, `from:${query} newer_than:1y`, 50).catch(() => [] as EmailMetadata[]),
    // Emails FROM user TO the contact (last year)
    searchEmails(accessToken, `to:${query} newer_than:1y`, 50).catch(() => [] as EmailMetadata[]),
    // Calendar events for the past year + next 30 days
    listEvents(accessToken, {
      timeMin: oneYearAgo.toISOString(),
      timeMax: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 50,
    }).catch(() => [] as CalendarEvent[]),
    // Google Contacts matching the query (for phone numbers)
    searchContacts(accessToken, query, 10).catch(() => []),
  ]);

  // Build email-to-phone lookup from contacts
  const phoneByEmail = new Map<string, string>();
  const phoneByName = new Map<string, string>();
  for (const contact of contactsResults) {
    const phone = contact.phoneNumbers?.[0]?.value || null;
    if (phone) {
      // Map by email addresses
      for (const e of contact.emails) {
        phoneByEmail.set(e.value.toLowerCase(), phone);
      }
      // Map by display name (for fallback matching)
      if (contact.displayName) {
        phoneByName.set(contact.displayName.toLowerCase(), phone);
      }
    }
  }

  // Filter out automated emails
  const realEmailsFrom = emailsFrom.filter(e => !isAutomatedSender(e.from));
  // User-initiated emails are always "real" — no filtering needed
  const realEmailsTo = emailsTo;

  // Collect matched email addresses and build per-person email stats
  const matchedEmails = new Set<string>();
  const queryLower = query.toLowerCase();
  // Per-email-address stats: { email -> { displayName, fromThem, toThem, directToThem, lastDate } }
  const perPersonEmails = new Map<string, { displayName: string; fromThem: number; toThem: number; directToThem: number; lastDate: Date | null }>();

  const trackPerson = (addr: string, displayName: string, direction: 'from' | 'to', date: Date, isDirect: boolean) => {
    const key = addr.toLowerCase();
    const existing = perPersonEmails.get(key) || { displayName, fromThem: 0, toThem: 0, directToThem: 0, lastDate: null };
    if (direction === 'from') existing.fromThem++;
    else {
      existing.toThem++;
      if (isDirect) existing.directToThem++;
    }
    if (!existing.lastDate || date > existing.lastDate) existing.lastDate = date;
    // Prefer display name with both first and last name
    if (displayName.includes(' ') && !existing.displayName.includes(' ')) existing.displayName = displayName;
    perPersonEmails.set(key, existing);
  };

  for (const email of realEmailsFrom) {
    const fromAddr = extractEmailAddress(email.from);
    if (fromAddr.toLowerCase().includes(queryLower) || email.from.toLowerCase().includes(queryLower)) {
      matchedEmails.add(fromAddr);
      // Extract display name: "Andrew Hogue <ahogue@gmail.com>" -> "Andrew Hogue"
      const nameMatch = email.from.match(/^([^<]+)</);
      const displayName = nameMatch ? nameMatch[1].trim() : fromAddr;
      trackPerson(fromAddr, displayName, 'from', new Date(email.date), false);
    }
  }
  for (const email of realEmailsTo) {
    // Count total recipients to determine if this is a direct (1:1) or group email
    const totalRecipients = (email.to?.length || 0) + (email.cc ? 1 : 0);
    const isDirect = totalRecipients <= 2; // Just the user and the recipient

    for (const toAddr of email.to || []) {
      const addr = extractEmailAddress(toAddr);
      if (addr.toLowerCase().includes(queryLower) || toAddr.toLowerCase().includes(queryLower)) {
        matchedEmails.add(addr);
        const nameMatch = toAddr.match(/^([^<]+)</);
        const displayName = nameMatch ? nameMatch[1].trim() : addr;
        trackPerson(addr, displayName, 'to', new Date(email.date), isDirect);
      }
    }
  }

  // Email analysis
  const totalEmails = realEmailsFrom.length + realEmailsTo.length;
  const allEmails = [...realEmailsFrom, ...realEmailsTo]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lastEmail = allEmails[0] || null;
  const monthsAnalyzed = 12;
  const frequencyPerMonth = totalEmails / monthsAnalyzed;

  let initiator: 'them' | 'user' | 'balanced' = 'balanced';
  if (realEmailsFrom.length > realEmailsTo.length * 1.5) {
    initiator = 'them';
  } else if (realEmailsTo.length > realEmailsFrom.length * 1.5) {
    initiator = 'user';
  }

  const recentSubjects = allEmails
    .slice(0, 5)
    .map(e => e.subject)
    .filter(Boolean);

  // Calendar analysis — filter events that mention the query name
  const relevantEvents = calendarEvents.filter(event => {
    // Check attendees
    const hasAttendee = event.attendees?.some(a =>
      (a.displayName?.toLowerCase().includes(queryLower)) ||
      (a.email?.toLowerCase().includes(queryLower))
    );
    // Check event title
    const inTitle = event.summary?.toLowerCase().includes(queryLower);
    return hasAttendee || inTitle;
  });

  const pastEvents = relevantEvents.filter(e => {
    const eventDate = new Date(e.start.dateTime || e.start.date || '');
    return eventDate <= now;
  }).sort((a, b) => {
    const dateA = new Date(a.start.dateTime || a.start.date || '');
    const dateB = new Date(b.start.dateTime || b.start.date || '');
    return dateB.getTime() - dateA.getTime();
  });

  const upcomingEvents = relevantEvents.filter(e => {
    const eventDate = new Date(e.start.dateTime || e.start.date || '');
    return eventDate > now;
  }).sort((a, b) => {
    const dateA = new Date(a.start.dateTime || a.start.date || '');
    const dateB = new Date(b.start.dateTime || b.start.date || '');
    return dateA.getTime() - dateB.getTime();
  });

  const calFrequencyPerMonth = relevantEvents.length / monthsAnalyzed;
  const meetingPattern = detectMeetingPattern(pastEvents);

  // Compute relationship strength
  const totalTouchpoints = totalEmails + relevantEvents.length;
  let strength: ContactRelationship['strength'] = 'none';
  if (totalTouchpoints === 0) {
    strength = 'none';
  } else if (frequencyPerMonth >= 4 || calFrequencyPerMonth >= 2) {
    strength = 'high';
  } else if (frequencyPerMonth >= 1 || calFrequencyPerMonth >= 0.5) {
    strength = 'medium';
  } else {
    strength = 'low';
  }

  // Build per-person breakdown: combine email stats + calendar per matched email address
  // Also count calendar meetings per person by checking attendee emails
  const perPersonMeetings = new Map<string, { count: number; lastDate: Date | null }>();
  for (const event of relevantEvents) {
    for (const attendee of event.attendees || []) {
      const attendeeEmail = attendee.email?.toLowerCase();
      if (attendeeEmail && perPersonEmails.has(attendeeEmail)) {
        const existing = perPersonMeetings.get(attendeeEmail) || { count: 0, lastDate: null };
        existing.count++;
        const eventDate = new Date(event.start.dateTime || event.start.date || '');
        if (!existing.lastDate || eventDate > existing.lastDate) existing.lastDate = eventDate;
        perPersonMeetings.set(attendeeEmail, existing);
      }
    }
  }

  const perPersonBreakdown: PersonBreakdown[] = Array.from(perPersonEmails.entries())
    .map(([emailAddr, stats]) => {
      const meetings = perPersonMeetings.get(emailAddr) || { count: 0, lastDate: null };
      const personEmailCount = stats.fromThem + stats.toThem;
      const personMeetingCount = meetings.count;
      // Use direct emails (1:1) + emails from them for strength — group/list emails don't count
      const directEmailCount = stats.fromThem + stats.directToThem;
      const directFreqPerMonth = directEmailCount / monthsAnalyzed;
      const personCalFreqPerMonth = personMeetingCount / monthsAnalyzed;

      let personStrength: PersonBreakdown['strength'] = 'none';
      if (directEmailCount === 0 && personMeetingCount === 0) {
        personStrength = 'none';
      } else if (directFreqPerMonth >= 4 || personCalFreqPerMonth >= 2) {
        personStrength = 'high';
      } else if (directFreqPerMonth >= 1 || personCalFreqPerMonth >= 0.5) {
        personStrength = 'medium';
      } else {
        personStrength = 'low';
      }

      // Look up phone number from contacts (by email, then by display name)
      const phone = phoneByEmail.get(emailAddr) ||
        phoneByName.get(stats.displayName.toLowerCase()) ||
        null;

      return {
        email: emailAddr,
        displayName: stats.displayName,
        phone,
        emailCount: personEmailCount,
        fromThem: stats.fromThem,
        toThem: stats.toThem,
        lastEmailDate: stats.lastDate?.toISOString() || null,
        meetingCount: personMeetingCount,
        lastMeetingDate: meetings.lastDate?.toISOString() || null,
        strength: personStrength,
      };
    })
    // Sort by: strength (high > medium > low > none), then direct email count + meetings, then recency
    .sort((a, b) => {
      const strengthOrder = { high: 3, medium: 2, low: 1, none: 0 };
      const strengthDiff = strengthOrder[b.strength] - strengthOrder[a.strength];
      if (strengthDiff !== 0) return strengthDiff;
      // Prefer direct (1:1) interactions over group email presence
      const aDirectScore = (a.fromThem + a.meetingCount) * 2 + a.emailCount;
      const bDirectScore = (b.fromThem + b.meetingCount) * 2 + b.emailCount;
      if (bDirectScore !== aDirectScore) return bDirectScore - aDirectScore;
      // Recency
      const aDate = a.lastEmailDate || a.lastMeetingDate || '';
      const bDate = b.lastEmailDate || b.lastMeetingDate || '';
      return bDate.localeCompare(aDate);
    });

  // Add contacts who have phone numbers but weren't found in email activity
  // They'll appear at the bottom with strength "none"
  const breakdownEmails = new Set(perPersonBreakdown.map(p => p.email.toLowerCase()));
  for (const contact of contactsResults) {
    const phone = contact.phoneNumbers?.[0]?.value || null;
    if (!phone) continue;
    // Check if any of this contact's emails are already in the breakdown
    const alreadyIncluded = contact.emails.some(e => breakdownEmails.has(e.value.toLowerCase()));
    if (!alreadyIncluded) {
      perPersonBreakdown.push({
        email: contact.emails[0]?.value || '',
        displayName: contact.displayName,
        phone,
        emailCount: 0,
        fromThem: 0,
        toThem: 0,
        lastEmailDate: null,
        meetingCount: 0,
        lastMeetingDate: null,
        strength: 'none',
      });
    }
  }

  // Build summary
  const summary = buildSummary(query, totalEmails, realEmailsFrom.length, realEmailsTo.length,
    relevantEvents.length, lastEmail?.date || null, strength, meetingPattern);

  return {
    query,
    perPersonBreakdown,
    email: {
      totalEmails,
      fromThem: realEmailsFrom.length,
      toThem: realEmailsTo.length,
      lastEmailDate: lastEmail?.date || null,
      lastEmailSubject: lastEmail?.subject || null,
      frequencyPerMonth: Math.round(frequencyPerMonth * 10) / 10,
      initiator,
      recentSubjects,
      matchedEmails: Array.from(matchedEmails),
    },
    calendar: {
      totalMeetings: relevantEvents.length,
      upcomingMeetings: upcomingEvents.length,
      lastMeetingDate: pastEvents[0]?.start.dateTime || pastEvents[0]?.start.date || null,
      lastMeetingSummary: pastEvents[0]?.summary || null,
      nextMeetingDate: upcomingEvents[0]?.start.dateTime || upcomingEvents[0]?.start.date || null,
      nextMeetingSummary: upcomingEvents[0]?.summary || null,
      frequencyPerMonth: Math.round(calFrequencyPerMonth * 10) / 10,
      pattern: meetingPattern,
    },
    strength,
    summary,
  };
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Detect recurring meeting patterns from past events.
 * e.g., "weekly on Tuesdays", "biweekly on Fridays", "monthly"
 */
function detectMeetingPattern(events: CalendarEvent[]): string | null {
  if (events.length < 3) return null;

  // Get event dates
  const dates = events
    .map(e => new Date(e.start.dateTime || e.start.date || ''))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 3) return null;

  // Calculate gaps between consecutive meetings (in days)
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffDays = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    gaps.push(Math.round(diffDays));
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // Check for weekly pattern (5-9 day gaps)
  if (avgGap >= 5 && avgGap <= 9) {
    const dayOfWeek = getMostCommonDay(dates);
    return `weekly on ${dayOfWeek}s`;
  }

  // Check for biweekly (12-16 day gaps)
  if (avgGap >= 12 && avgGap <= 16) {
    const dayOfWeek = getMostCommonDay(dates);
    return `biweekly on ${dayOfWeek}s`;
  }

  // Check for monthly (25-35 day gaps)
  if (avgGap >= 25 && avgGap <= 35) {
    return 'monthly';
  }

  // Check for roughly every 3 weeks (18-24 day gaps)
  if (avgGap >= 18 && avgGap <= 24) {
    return `every ~3 weeks`;
  }

  return null;
}

function getMostCommonDay(dates: Date[]): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const counts = new Array(7).fill(0);
  for (const d of dates) {
    counts[d.getDay()]++;
  }
  const maxIdx = counts.indexOf(Math.max(...counts));
  return days[maxIdx];
}

// ============================================================================
// Summary Builder
// ============================================================================

function buildSummary(
  query: string,
  totalEmails: number,
  fromThem: number,
  toThem: number,
  totalMeetings: number,
  lastEmailDate: string | null,
  strength: string,
  meetingPattern: string | null,
): string {
  if (totalEmails === 0 && totalMeetings === 0) {
    return `No email or calendar history found for "${query}" in the past year.`;
  }

  const parts: string[] = [];

  if (totalEmails > 0) {
    const recency = lastEmailDate ? timeSince(new Date(lastEmailDate)) : 'unknown';
    parts.push(`${totalEmails} emails (${fromThem} from them, ${toThem} from you), last ${recency}`);
  }

  if (totalMeetings > 0) {
    const patternStr = meetingPattern ? `, pattern: ${meetingPattern}` : '';
    parts.push(`${totalMeetings} meetings${patternStr}`);
  }

  return `${strength} affinity — ${parts.join('; ')}.`;
}

function timeSince(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
