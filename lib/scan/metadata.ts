/**
 * Metadata Processor for Insight Scan
 *
 * Collects and processes email/calendar metadata to build
 * context for AI analysis. Handles parallel fetching and
 * graceful error recovery.
 */

import { searchEmailsPaginated, getThreadInfo, type EmailMetadata } from '../google/gmail';
import { listEvents, type CalendarEvent } from '../google/calendar';
import { scoreEmail, getScoreBreakdown } from '../email/scoring';
import type { ScoredEmail, EmailMetadataWithHeaders } from '../email/types';
import type {
  ScanContext,
  TopSender,
  AwaitingResponse,
  UpcomingEvent,
  EventNeedsPrep,
} from './types';

// ============================================================================
// Configuration
// ============================================================================

interface ScanOptions {
  emailDays: number;
  calendarDays: number;
  maxEmails: number;
  userEmail?: string; // User's email for scoring
  preppedEventMap?: Record<string, string>; // eventId -> actionId for already-prepped meetings
  taskThreadIds?: Set<string>; // Thread IDs of active tasks - don't exclude these emails even if user sent last message
  protectedSenders?: Set<string>; // Sender names with active tasks - don't exclude their emails
  onGmailProgress?: (count: number) => void;
  onCalendarProgress?: (count: number) => void;
}

const DEFAULT_OPTIONS: ScanOptions = {
  emailDays: 30,
  calendarDays: 14,
  maxEmails: 300,
};

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Build scan context by fetching email and calendar metadata
 * Handles errors gracefully - returns partial results if one source fails
 */
export async function buildScanContext(
  accessToken: string,
  options: Partial<ScanOptions> = {}
): Promise<ScanContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: { gmail?: string; calendar?: string } = {};

  // Parallel fetch with individual error handling
  const [emailsResult, eventsResult] = await Promise.allSettled([
    fetchInboxEmails(accessToken, opts),
    fetchCalendarEvents(accessToken, opts),
  ]);

  // Extract results or record errors
  const inboxEmails = emailsResult.status === 'fulfilled' ? emailsResult.value : [];
  if (emailsResult.status === 'rejected') {
    errors.gmail = emailsResult.reason?.message || 'Failed to fetch emails';
  }

  const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
  if (eventsResult.status === 'rejected') {
    errors.calendar = eventsResult.reason?.message || 'Failed to fetch calendar';
  }

  // Process email metadata - only emails user needs to respond to
  const topSenders = groupBySender(inboxEmails);
  const awaitingResponse = await findAwaitingResponse(accessToken, inboxEmails, opts.userEmail, opts.taskThreadIds, opts.protectedSenders);

  // Process calendar metadata
  const upcoming = formatUpcomingEvents(events);
  const preppedMap = opts.preppedEventMap || {};
  // Build contact affinity from top senders (simple heuristic)
  const contactAffinity: Record<string, number> = {};
  for (const sender of topSenders) {
    contactAffinity[sender.email.toLowerCase()] = sender.count;
  }
  const needsPrep = findEventsNeedingPrep(events, preppedMap, opts.userEmail, contactAffinity);

  return {
    emails: {
      topSenders: topSenders.slice(0, 15),
      awaitingResponse: awaitingResponse.slice(0, 30),
      sentAwaitingReply: [], // Removed - only showing emails user needs to respond to
      totalScanned: inboxEmails.length,
    },
    calendar: {
      upcoming: upcoming.slice(0, 15),
      needsPrep: needsPrep.slice(0, 5),
      totalEvents: events.length,
      rawEvents: events.map(e => ({ location: e.location })), // For location detection
    },
    fetchedAt: new Date().toISOString(),
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

// ============================================================================
// Email Fetching
// ============================================================================

async function fetchInboxEmails(
  accessToken: string,
  opts: ScanOptions
): Promise<EmailMetadata[]> {
  // in:inbox excludes archived emails; -category excludes promotions/social
  const query = `in:inbox newer_than:${opts.emailDays}d -from:me -category:promotions -category:social`;
  return searchEmailsPaginated(accessToken, query, opts.maxEmails, opts.onGmailProgress);
}

// ============================================================================
// Calendar Fetching
// ============================================================================

async function fetchCalendarEvents(
  accessToken: string,
  opts: ScanOptions
): Promise<CalendarEvent[]> {
  const now = new Date();
  const maxTime = new Date(now.getTime() + opts.calendarDays * 24 * 60 * 60 * 1000);

  return listEvents(accessToken, {
    timeMin: now.toISOString(),
    timeMax: maxTime.toISOString(),
    maxResults: 50,
  });
}

// ============================================================================
// Email Processing
// ============================================================================

/**
 * Group emails by sender and count
 */
function groupBySender(emails: EmailMetadata[]): TopSender[] {
  const senderMap = new Map<string, {
    email: string;
    name: string;
    count: number;
    lastSubject: string;
    lastDate: string;
  }>();

  for (const email of emails) {
    const fromEmail = extractEmail(email.from);
    const fromName = extractName(email.from);

    const existing = senderMap.get(fromEmail);
    if (existing) {
      existing.count++;
      // Keep the most recent
      if (new Date(email.date) > new Date(existing.lastDate)) {
        existing.lastSubject = email.subject;
        existing.lastDate = email.date;
      }
    } else {
      senderMap.set(fromEmail, {
        email: fromEmail,
        name: fromName,
        count: 1,
        lastSubject: email.subject,
        lastDate: email.date,
      });
    }
  }

  // Sort by count descending
  return Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count);
}

/**
 * Find emails that appear to need a response
 * Uses the email scoring layer to filter out automated/platform emails
 * Only includes emails with tier 'high' or 'medium'
 * @param taskThreadIds - Thread IDs of active tasks - don't exclude these even if user sent last message
 * @param protectedSenders - Sender names with active tasks - don't exclude their emails
 */
async function findAwaitingResponse(
  accessToken: string,
  emails: EmailMetadata[],
  userEmail?: string,
  taskThreadIds?: Set<string>,
  protectedSenders?: Set<string>
): Promise<AwaitingResponse[]> {
  const now = Date.now();
  const candidates: AwaitingResponse[] = [];

  // Score all emails using the scoring layer
  const scoredEmails: Array<{ email: EmailMetadata; scored: ScoredEmail | null }> = [];

  for (const email of emails) {
    // Only score if we have raw headers
    if (email.rawHeaders && userEmail) {
      const emailWithHeaders: EmailMetadataWithHeaders = {
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
        rawHeaders: email.rawHeaders,
        threadLength: email.threadLength,
        labelIds: email.labelIds,
      };
      const scored = scoreEmail(emailWithHeaders, userEmail);
      scoredEmails.push({ email, scored });
    } else {
      scoredEmails.push({ email, scored: null });
    }
  }

  for (const { email, scored } of scoredEmails) {
    // Log high-tier emails prominently
    if (scored && scored.tier === 'high') {
      console.log(`[SCAN] HIGH-TIER: "${email.subject}" from ${extractName(email.from)} - score: ${scored.score}, isDirect: ${scored.signals.isDirect}, isUnread: ${email.isUnread}`);
    } else if (scored && scored.score >= 5) {
      // Log emails close to high tier with full breakdown for debugging
      const breakdown = getScoreBreakdown(scored.signals);
      const breakdownStr = breakdown.map(b => `${b.modifier}:${b.value > 0 ? '+' : ''}${b.value}`).join(', ');
      console.log(`[SCAN] Near-high: "${email.subject}" from ${extractName(email.from)} - tier: ${scored.tier}, score: ${scored.score}, breakdown: [${breakdownStr}]`);
    }

    // CRITICAL: Use scoring layer to filter
    // Only include 'high' or 'medium' tier emails (skip 'low' and 'skip')
    if (scored) {
      if (scored.tier === 'skip' || scored.tier === 'low') {
        // Log why email was skipped for debugging
        const reasons: string[] = [];
        if (scored.signals.isPlatform) reasons.push('platform');
        if (scored.signals.isMailingList) reasons.push('mailing-list');
        if (scored.signals.isAutomated) reasons.push('automated');
        if (scored.signals.isMarketingSubject) reasons.push('marketing');
        if (scored.signals.isHtmlOnly) reasons.push('html-only');
        console.log(`[SCAN] SKIP: "${email.subject}" from ${extractName(email.from)} - tier: ${scored.tier}, score: ${scored.score}, reasons: [${reasons.join(', ')}]`);
        continue;
      }
      // For medium-tier emails, require unread status UNLESS it's a direct email
      // Direct emails (1:1 or small group) likely need a response even if read
      // High-tier emails show even if read (user may have opened but not replied)
      if (scored.tier === 'medium' && !email.isUnread && !scored.signals.isDirect) {
        console.log(`[SCAN] Skipping read medium-tier: "${email.subject}"`);
        continue;
      }
    } else {
      // Fallback to basic filtering if no scoring available - require unread
      if (!email.isUnread) continue;
      if (isAutomatedEmail(email)) continue;
    }

    // Calculate days ago and add recency boost to score
    const emailDate = new Date(email.date).getTime();
    const daysAgo = Math.floor((now - emailDate) / (1000 * 60 * 60 * 24));

    // Boost score for recent emails (today is most urgent)
    let recencyBoost = 0;
    if (daysAgo === 0) recencyBoost = 10;       // Today: +10
    else if (daysAgo === 1) recencyBoost = 5;   // Yesterday: +5
    else if (daysAgo <= 3) recencyBoost = 2;    // Last 3 days: +2

    const boostedScore = (scored?.score || 0) + recencyBoost;

    // Check if we've already replied in this thread
    // Only skip if we sent the LAST message AND it's not a high-tier email AND there's no active task for this thread/sender
    const isHighTier = scored?.tier === 'high';
    const hasActiveTask = taskThreadIds?.has(email.threadId);
    // Check if sender has an active task (by name match)
    const senderName = extractName(email.from).toLowerCase();
    const hasProtectedSender = protectedSenders && Array.from(protectedSenders).some(
      name => senderName.includes(name.toLowerCase()) || name.toLowerCase().includes(senderName)
    );

    if (email.threadId) {
      const threadInfo = await getThreadInfo(accessToken, email.threadId);
      if (threadInfo && threadInfo.messageCount > 1) {
        // If we sent the last message, skip (unless high-tier OR has active task OR sender is protected)
        const lastFromMe = threadInfo.lastMessageFrom.toLowerCase().includes('me') ||
                          threadInfo.lastMessageFrom.includes(extractEmail(email.to[0] || ''));
        if (lastFromMe && !isHighTier && !hasActiveTask && !hasProtectedSender) {
          console.log(`[SCAN] Skipping thread where user sent last message: "${email.subject}"`);
          continue;
        }
        if (lastFromMe && (hasActiveTask || hasProtectedSender)) {
          console.log(`[SCAN] Keeping thread with active task/protected sender despite user sent last: "${email.subject}" (sender: ${senderName})`);
        }
      }
    }

    // Include scoring info for better LLM context
    const isPersonal = scored?.signals.isPersonalDomain || false;
    const isDirect = scored?.signals.isDirect || false;

    candidates.push({
      threadId: email.threadId,
      messageId: email.id,
      from: extractEmail(email.from),
      fromName: extractName(email.from),
      subject: email.subject,
      snippet: email.snippet,
      daysAgo,
      date: email.date,
      // Add scoring context for LLM
      isPersonalEmail: isPersonal,
      isDirectEmail: isDirect,
      priorityScore: boostedScore, // Use boosted score (includes recency)
    });
  }

  // Sort by score (highest first), then by days ago
  return candidates.sort((a, b) => {
    // Primary sort: priority score (higher is better)
    const scoreA = a.priorityScore ?? 0;
    const scoreB = b.priorityScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    // Secondary sort: days ago (older is more urgent)
    return b.daysAgo - a.daysAgo;
  });
}

/**
 * Check if email appears to be automated (newsletter, notification, etc.)
 */
function isAutomatedEmail(email: EmailMetadata): boolean {
  // Check List-Unsubscribe header
  if (email.rawHeaders?.listUnsubscribe) return true;

  // Check common automated sender patterns
  const from = email.from.toLowerCase();
  const automatedPatterns = [
    'noreply@',
    'no-reply@',
    'donotreply@',
    'notifications@',
    'alert@',
    'news@',
    'newsletter@',
    'updates@',
    'marketing@',
    'support@', // Usually automated responses
  ];

  if (automatedPatterns.some(p => from.includes(p))) return true;

  // Check Gmail labels for promotions/social
  if (email.labelIds?.includes('CATEGORY_PROMOTIONS')) return true;
  if (email.labelIds?.includes('CATEGORY_SOCIAL')) return true;

  return false;
}

// ============================================================================
// Calendar Processing
// ============================================================================

/**
 * Format calendar events for display
 */
function formatUpcomingEvents(events: CalendarEvent[]): UpcomingEvent[] {
  return events
    .filter(e => e.status !== 'cancelled')
    .map(event => ({
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date || '',
      end: event.end.dateTime || event.end.date || '',
      attendees: (event.attendees || [])
        .filter(a => !a.self)
        .map(a => a.displayName || a.email),
      hasConferenceLink: !!(event.hangoutLink || event.conferenceData?.entryPoints?.length),
      location: event.location,
    }));
}

/**
 * Score a meeting to determine if it needs preparation
 * Returns a score - higher means more likely to need prep
 */
interface MeetingScore {
  score: number;
  signals: {
    attendeeCount: number;
    userIsOrganizer: boolean;
    isPresentationMeeting: boolean;
    isPassiveEvent: boolean;
    hasKeyContacts: boolean;
  };
  reason?: string;
}

function scoreMeeting(
  event: CalendarEvent,
  userEmail?: string,
  contactAffinity?: Record<string, number> // email -> count of emails exchanged
): MeetingScore {
  let score = 0;
  const title = (event.summary || '').toLowerCase();
  const description = (event.description || '').toLowerCase();

  // Hard exclusion: obvious all-hands/company events should never need prep
  const hardExcludePatterns = ['all hands', 'all-hands', 'town hall', 'company meeting'];
  if (hardExcludePatterns.some(p => title.includes(p))) {
    return {
      score: -100,
      signals: {
        attendeeCount: 0,
        userIsOrganizer: false,
        isPresentationMeeting: false,
        isPassiveEvent: true,
        hasKeyContacts: false,
      },
      reason: 'Hard excluded: all-hands/town hall event',
    };
  }

  // Get all non-self attendees
  const allAttendees = (event.attendees || []).filter(a => !a.self);
  const attendeeCount = allAttendees.length;

  // Check if user is organizer (via self + organizer flags on attendees)
  const userIsOrganizer = (event.attendees || []).some(a => a.self && a.organizer);

  // Meeting size scoring
  if (attendeeCount === 1) {
    // 1:1 meeting - highest priority
    score += 15;
  } else if (attendeeCount <= 4) {
    // Small group (2-4 people)
    score += 10;
  } else if (attendeeCount <= 9) {
    // Medium group (5-9) - penalty starts
    score -= 5;
  } else {
    // Large group (10+) - significant penalty
    score -= 10;
  }

  // User role scoring
  if (userIsOrganizer) {
    score += 8;
  }

  // Presentation/active meeting signals (positive)
  const presentationKeywords = ['demo', 'review', 'interview', 'consultation', 'sync', '1:1', 'one on one', 'chat', 'catch up', 'coffee'];
  const isPresentationMeeting = presentationKeywords.some(k => title.includes(k) || description.includes(k));
  if (isPresentationMeeting) {
    score += 5;
  }

  // Passive/broadcast event signals (negative)
  // Expanded list includes forums, knowledge shares, and other passive events
  const passiveKeywords = [
    'all-hands', 'all hands', 'town hall', 'standup', 'stand-up', 'stand up',
    'weekly', 'office hours', 'ama', 'webinar', 'lecture', 'talk',
    'presentation', 'consciousness', 'spirituality', 'community',
    'networking', 'meetup', 'social', 'happy hour',
    // Added: forums, knowledge shares, and info sessions
    'forum', 'knowledge forum', 'knowledge share', 'knowledge sharing',
    'company meeting', 'team meeting', 'org meeting',
    'lunch and learn', 'brown bag', 'fireside', 'fireside chat',
    'announcement', 'update meeting', 'info session',
  ];
  const isPassiveEvent = passiveKeywords.some(k => title.includes(k) || description.includes(k));
  if (isPassiveEvent) {
    score -= 15; // Increased from -8 to ensure passive events don't exceed threshold
  }

  // Contact affinity scoring
  let hasKeyContacts = false;
  if (contactAffinity) {
    for (const attendee of allAttendees) {
      const email = attendee.email.toLowerCase();
      const emailCount = contactAffinity[email] || 0;
      if (emailCount >= 10) {
        // High affinity - email frequently
        score += 5;
        hasKeyContacts = true;
        break; // Only count once
      } else if (emailCount >= 3) {
        // Medium affinity
        score += 3;
        hasKeyContacts = true;
        break;
      }
    }
    // If no email history at all with any attendee, slight penalty
    const hasAnyHistory = allAttendees.some(a => (contactAffinity[a.email.toLowerCase()] || 0) > 0);
    if (!hasAnyHistory && attendeeCount > 0) {
      score -= 3;
    }
  }

  return {
    score,
    signals: {
      attendeeCount,
      userIsOrganizer,
      isPresentationMeeting,
      isPassiveEvent,
      hasKeyContacts,
    },
  };
}

// Minimum score threshold for showing a meeting
const MEETING_PREP_THRESHOLD = 8;

/**
 * Find events that likely need preparation
 * Uses scoring system to filter based on meeting size, user role, contact affinity, etc.
 * @param preppedEventMap - Map of eventId -> actionId for already-prepped meetings
 * @param userEmail - User's email for determining organizer status
 * @param contactAffinity - Map of email -> count of emails exchanged
 */
function findEventsNeedingPrep(
  events: CalendarEvent[],
  preppedEventMap: Record<string, string> = {},
  userEmail?: string,
  contactAffinity?: Record<string, number>
): EventNeedsPrep[] {
  const now = Date.now();
  const candidates: EventNeedsPrep[] = [];

  for (const event of events) {
    if (event.status === 'cancelled') continue;

    // Check if already prepped
    const preppedActionId = preppedEventMap[event.id];

    const startTime = new Date(event.start.dateTime || event.start.date || '').getTime();
    const hoursUntil = (startTime - now) / (1000 * 60 * 60);

    // Only consider events 0-48 hours out
    if (hoursUntil < 0 || hoursUntil > 48) continue;

    // Must have attendees (not just self)
    const externalAttendees = (event.attendees || []).filter(a => !a.self);
    if (externalAttendees.length === 0) continue;

    // Score the meeting
    const meetingScore = scoreMeeting(event, userEmail, contactAffinity);

    // Log scoring for debugging
    console.log(`[MEETING SCORE] "${event.summary}" - score: ${meetingScore.score}, attendees: ${meetingScore.signals.attendeeCount}, organizer: ${meetingScore.signals.userIsOrganizer}, passive: ${meetingScore.signals.isPassiveEvent}`);

    // Skip meetings below threshold (unless already prepped - show those for continuity)
    if (meetingScore.score < MEETING_PREP_THRESHOLD && !preppedActionId) {
      console.log(`[MEETING SKIP] "${event.summary}" - score ${meetingScore.score} below threshold ${MEETING_PREP_THRESHOLD}`);
      continue;
    }

    candidates.push({
      eventId: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date || '',
      hoursUntil: Math.round(hoursUntil),
      attendees: externalAttendees.map(a => a.displayName || a.email),
      description: event.description?.slice(0, 500),
      // Mark if already prepped with link to action
      alreadyPrepped: !!preppedActionId,
      preppedActionId: preppedActionId,
      // Include score for potential future use
      prepScore: meetingScore.score,
    });
  }

  // Sort by score (highest first), then by hours until
  return candidates.sort((a, b) => {
    // Primary: score (higher = more important)
    const scoreA = a.prepScore ?? 0;
    const scoreB = b.prepScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    // Secondary: sooner events first
    return a.hoursUntil - b.hoursUntil;
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract email address from "Name <email@example.com>" format
 */
function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  if (match) return match[1].toLowerCase();
  return from.toLowerCase().trim();
}

/**
 * Extract name from "Name <email@example.com>" format
 */
function extractName(from: string): string {
  const match = from.match(/^(.+?)\s*</);
  if (match) return match[1].replace(/"/g, '').trim();

  // If no angle brackets, might just be email
  const email = extractEmail(from);
  return email.split('@')[0];
}
