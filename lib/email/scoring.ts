/**
 * Email Signal Scoring
 *
 * A lightweight email priority scoring layer that runs BEFORE emails
 * are sent to the LLM. This reduces noise, saves tokens, and ensures
 * the LLM focuses on emails that actually matter.
 */

import type {
  EmailSignals,
  EmailTier,
  ScoredEmail,
  RawEmailHeaders,
  EmailMetadataWithHeaders,
} from './types';
import {
  extractEmailAddress,
  parseEmailList,
  isAutomatedSender,
} from './scoring-utils';

// ============================================================================
// Score Modifiers
// ============================================================================

const SCORE_MODIFIERS = {
  // === Positive signals ===
  DIRECT_RECIPIENT: 12,      // User is direct recipient (≤3 total recipients) - strong signal
  ONE_TO_ONE: 5,             // Exactly 1 sender, 1 recipient
  EXISTING_THREAD: 3,        // Part of an existing conversation
  LONG_THREAD: 2,            // Thread has 3+ messages
  HAS_ATTACHMENT: 3,         // Has attachments (contracts, docs, proposals)
  GMAIL_PRIMARY: 3,          // Gmail thinks it's important (Primary inbox)
  PERSONAL_DOMAIN: 5,        // From personal email (gmail, outlook) - likely real person
  HUMAN_SENDER: 4,           // No automation flags - likely genuine human correspondence

  // === Negative signals (reduced to not overwhelm direct emails) ===
  CC_RECIPIENT: -3,          // User is CC'd (FYI)
  BCC_RECIPIENT: -5,         // User is BCC'd (mass email)
  MANY_RECIPIENTS: -3,       // 5+ recipients
  MARKETING_SUBJECT: -4,     // Subject matches promo patterns

  SELF_SENT: -20,            // User sent to themselves (reminder, not actionable inbox item)

  // These often co-occur, so values are reduced to prevent over-penalizing
  MAILING_LIST: -6,          // Has List-Unsubscribe header (was -8)
  AUTOMATED_SENDER: -4,      // noreply sender or generic prefix (was -6)
  PLATFORM_DOMAIN: -4,       // From known platform like LinkedIn (was -8)
  PLATFORM_MEDIATED: -4,     // "via LinkedIn" style sender (was -6)
  HTML_ONLY_EMAIL: -4,       // Newsletter-style snippet indicators (was -8)

  // Gmail category modifiers (trust Gmail's classification)
  GMAIL_PROMOTIONS: -10,     // Gmail flagged as promotional
  GMAIL_SOCIAL: -6,          // Social network notifications
  GMAIL_UPDATES: -4,         // Automated updates/receipts
  GMAIL_FORUMS: -5,          // Mailing lists/forums
};

// Tier thresholds
const TIER_THRESHOLDS = {
  HIGH: 10,     // Score >= 10 is high priority
  MEDIUM: 3,    // Score 3-9 is medium priority
  LOW: -2,      // Score -2 to 2 is low priority
  // Score < -2 is skip
};

// ============================================================================
// Marketing Subject Detection
// ============================================================================

const MARKETING_PATTERNS = [
  /\d+%\s*off/i,                    // "20% off", "50% OFF"
  /unsubscribe/i,                   // "unsubscribe" in subject
  /\bsale\b/i,                      // "sale"
  /free\s*shipping/i,               // "free shipping"
  /limited\s*time/i,                // "limited time"
  /weekly\s*digest/i,               // "weekly digest"
  /daily\s*digest/i,                // "daily digest"
  /\bnewsletter\b/i,                // "newsletter"
  /don'?t\s*miss/i,                 // "don't miss"
  /special\s*offer/i,               // "special offer"
  /your\s*(daily|weekly)/i,         // "your daily/weekly"
  /\bpromo\b/i,                     // "promo"
  /\bdeal\b/i,                      // "deal"
  /flash\s*sale/i,                  // "flash sale"
  /exclusive\s*(offer|deal|access)/i, // "exclusive offer/deal/access"
  /act\s*now/i,                     // "act now"
  /last\s*chance/i,                 // "last chance"
  /transaction\s*alert/i,           // "transaction alert"
  /payment\s*(received|sent|confirmed)/i, // payment notifications
  /order\s*(confirmation|shipped|delivered)/i, // order notifications
  /\bdaily\b.*\b(apps?|news|update)/i, // "Daily Apps", "Daily News"
  /\bweekly\b.*\b(apps?|news|update|roundup)/i, // "Weekly Update"
  /\bdigest\b/i,                    // any "digest"
  /\b(morning|evening|daily|weekly)\s*brief\b/i, // "morning brief", "evening brief", "daily brief"
  // Note: Removed "alerts" and "notifications" - too aggressive, catches legitimate business alerts
  // Goal-tracking/habit services
  /smart\s*goals?/i,                // "smart goals", "Smart Goal"
  /weekly\s*(goals?|recap|summary)/i, // "weekly goals", "weekly recap"
  /goal\s*(review|check|update)/i,  // "goal review", "goal check"
];

// Patterns in sender name indicating platform-mediated email
// e.g., "Sarah via LinkedIn", "John from AlphaSights"
const PLATFORM_MEDIATED_SENDER_PATTERNS = [
  /\bvia\s+\w+/i,                   // "Sarah via LinkedIn"
  /\bfrom\s+(the\s+)?\w+\s*(team|platform)?$/i, // "John from AlphaSights"
  /\bon\s+behalf\s+of\b/i,          // "on behalf of"
  /\b(team|platform)\s*$/i,         // ends with "team" or "platform"
];

/**
 * Check if subject line matches marketing patterns
 */
function isMarketingSubject(subject: string): boolean {
  return MARKETING_PATTERNS.some((pattern) => pattern.test(subject));
}

/**
 * Check if sender name indicates a platform-mediated email
 * e.g., "Sarah via LinkedIn", "John from AlphaSights Team"
 */
function isPlatformMediatedSender(from: string): boolean {
  return PLATFORM_MEDIATED_SENDER_PATTERNS.some((pattern) => pattern.test(from));
}

/**
 * Check if email appears to be HTML-formatted (newsletters, marketing, templated emails)
 * This signal is meant to catch mass emails/newsletters, not personal emails.
 * Gmail's snippet is extracted from the email - various patterns indicate HTML formatting.
 */
function isHtmlOnlyEmail(snippet: string): boolean {
  // Empty snippet could mean HTML-only OR just a short email - not conclusive
  if (!snippet || snippet.trim().length === 0) {
    return false; // Don't penalize - could be a valid short email
  }

  // Short snippets are NOT reliable for HTML detection
  // Personal emails like "Thanks!" or "See you soon" have short snippets
  // Only use explicit HTML indicators below

  // HTML formatting indicators (strong signals for newsletters/mass emails)
  const htmlIndicators = [
    /&nbsp;/gi,                              // HTML space entities
    /&#\d+;/g,                               // Numeric HTML entities
    /&[a-z]+;/gi,                            // Named HTML entities
    /\[image[:\s]/i,                         // "[image:" indicators
    /\[cid:/i,                               // Content-ID references
    /view\s*(this\s*)?(email|message|in\s*browser)/i, // "View in browser" text
    /click\s*here/i,                         // "Click here" CTAs
    /unsubscribe/i,                          // Unsubscribe text in snippet
    /privacy\s*policy/i,                     // Privacy policy links
    /©\s*\d{4}/i,                            // Copyright notices
    /all\s*rights\s*reserved/i,              // Legal text
    /trouble\s*viewing/i,                    // "Trouble viewing this email?"
    /view\s*(as|in)\s*web/i,                 // "View as webpage"
    /email\s*preferences/i,                  // Email preferences link
    /manage\s*(your\s*)?(subscription|preferences)/i, // Subscription management
  ];

  // Count how many HTML indicators are present
  const indicatorCount = htmlIndicators.reduce((count, pattern) => {
    return count + (pattern.test(snippet) ? 1 : 0);
  }, 0);

  // If any strong indicator is present, it's likely HTML marketing email
  if (indicatorCount >= 1) {
    return true;
  }

  return false;
}

// ============================================================================
// Signal Extraction
// ============================================================================

/**
 * Extract the domain from an email address
 */
export function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase().trim() : '';
}

// extractEmailAddress, parseEmailList, isAutomatedSender imported from scoring-utils.ts

/**
 * Check if the sender domain is a known platform/service (not personal email)
 *
 * NOTE: This list should only include platforms where emails are typically
 * automated/mass-sent. Domains where real people send direct emails
 * (VCs, communities) are NOT included because the PLATFORM_DOMAIN penalty
 * is conditionally applied only to non-direct emails.
 */
function isPlatformDomain(fromDomain: string): boolean {
  // Platforms that primarily send automated/mass emails
  // Excludes: VCs (a16z, sequoia), communities (YC, SPC) - real people email from these
  const platformDomains = [
    // Recruiting/Networking - mostly automated
    'linkedin.com',
    'indeed.com',
    'glassdoor.com',
    'angel.co',
    'wellfound.com',
    // News/Media - mostly newsletters
    'substack.com',
    'medium.com',
    'nytimes.com',
    'wsj.com',
    'bloomberg.com',
    // Event platforms - mostly automated
    'eventbrite.com',
    'lu.ma',
    'meetup.com',
    'calendly.com',
    // Productivity/SaaS notifications
    'notion.so',
    'slack.com',
    'asana.com',
    'monday.com',
    'github.com',
    'gitlab.com',
    'figma.com',
    'linear.app',
    // Retail/Commerce
    'amazon.com',
    'ebay.com',
    'etsy.com',
    'shopify.com',
    // Consulting/Research platforms (automated matching)
    'glginsights.com',
    'glg.it',
    'alphasights.com',
    'guidepoint.com',
  ];

  return platformDomains.some((domain) =>
    fromDomain === domain || fromDomain.endsWith('.' + domain)
  );
}

/**
 * Check if the sender domain is a personal email provider (likely a real person)
 */
function isPersonalEmailDomain(fromDomain: string): boolean {
  const personalDomains = [
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'yahoo.com',
    'ymail.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'aol.com',
    'protonmail.com',
    'proton.me',
    'fastmail.com',
    'zoho.com',
  ];

  return personalDomains.includes(fromDomain);
}

/**
 * Extract Gmail category from label IDs
 */
function extractGmailCategory(labelIds: string[]): EmailSignals['gmailCategory'] {
  if (labelIds.includes('CATEGORY_PROMOTIONS')) return 'promotions';
  if (labelIds.includes('CATEGORY_SOCIAL')) return 'social';
  if (labelIds.includes('CATEGORY_UPDATES')) return 'updates';
  if (labelIds.includes('CATEGORY_FORUMS')) return 'forums';
  if (labelIds.includes('CATEGORY_PERSONAL') || labelIds.includes('INBOX')) return 'primary';
  return undefined;
}

/**
 * Extract signals from raw email headers
 */
export function extractSignals(
  rawHeaders: RawEmailHeaders,
  userEmail: string,
  threadLength: number = 1,
  labelIds: string[] = [],
  snippet: string = ''
): EmailSignals {
  const userEmailLower = userEmail.toLowerCase();

  // Parse recipient lists
  const toList = parseEmailList(rawHeaders.to);
  const ccList = parseEmailList(rawHeaders.cc);
  const bccList = parseEmailList(rawHeaders.bcc);

  // Check user's position in recipients
  const isInTo = toList.some((e) =>
    extractEmailAddress(e).toLowerCase() === userEmailLower
  );
  const isInCc = ccList.some((e) =>
    extractEmailAddress(e).toLowerCase() === userEmailLower
  );
  const isInBcc = bccList.some((e) =>
    extractEmailAddress(e).toLowerCase() === userEmailLower
  );

  // Debug logging for direct email detection
  if (toList.length > 0 && toList.length <= 3) {
    console.log(`Scoring: To list count: ${toList.length}, isInTo: ${isInTo}`);
  }

  // Count total recipients
  const recipientCount = toList.length + ccList.length;

  // Determine if this is a direct email (user is in To with ≤3 recipients)
  const isDirect = isInTo && recipientCount <= 3;

  // One-to-one: exactly 1 in To, 0 in CC
  const isOneToOne = toList.length === 1 && ccList.length === 0;

  // Check for mailing list
  const isMailingList = !!rawHeaders.listUnsubscribe;

  // Check for automated sender
  const isAutomated = isAutomatedSender(rawHeaders.from, rawHeaders.replyTo);

  // Check if part of a thread
  const isThread = !!rawHeaders.inReplyTo || !!rawHeaders.references;

  // Check for marketing subject
  const isMarketingSubjectMatch = isMarketingSubject(rawHeaders.subject);

  // Check for platform-mediated sender ("via LinkedIn", "from X team")
  const isPlatformMediatedMatch = isPlatformMediatedSender(rawHeaders.from);

  // Check for HTML-only emails (newsletters with no meaningful text)
  const isHtmlOnlyMatch = isHtmlOnlyEmail(snippet);

  // Check sender domain type
  const fromDomain = extractDomain(rawHeaders.from);
  const isPlatform = isPlatformDomain(fromDomain);
  const isPersonalDomain = isPersonalEmailDomain(fromDomain);

  // Extract Gmail category
  const gmailCategory = extractGmailCategory(labelIds);

  // Self-sent: user emailing themselves (reminders, notes-to-self)
  const fromEmailAddr = extractEmailAddress(rawHeaders.from).toLowerCase();
  const isSelfSent = fromEmailAddr === userEmailLower;

  // Detect likely human sender (no automation flags)
  // This helps prioritize genuine human correspondence over receipts/notifications
  // Note: Don't check isHtmlOnly here - real people often send HTML-formatted emails
  const isHumanSender = !isAutomated && !isPlatform && !isMailingList && !isPlatformMediatedMatch;

  return {
    isDirect,
    isCc: isInCc,
    isBcc: isInBcc,
    isSelfSent,
    isMailingList,
    isAutomated,
    isPlatform,
    isPlatformMediated: isPlatformMediatedMatch,
    isHtmlOnly: isHtmlOnlyMatch,
    isPersonalDomain,
    isHumanSender,
    isOneToOne,
    recipientCount,
    isThread,
    threadLength,
    hasAttachment: false, // Will be set from message metadata
    isMarketingSubject: isMarketingSubjectMatch,
    gmailCategory,
  };
}

// ============================================================================
// Score Computation
// ============================================================================

/**
 * Get a breakdown of which modifiers were applied and their values
 */
export function getScoreBreakdown(signals: EmailSignals): { modifier: string; value: number }[] {
  const breakdown: { modifier: string; value: number }[] = [];

  // Positive signals
  // Don't award DIRECT/ONE_TO_ONE for mailing lists — mass emails send to individual
  // addresses but aren't meaningfully "direct" human correspondence
  if (signals.isDirect && !signals.isMailingList) {
    breakdown.push({ modifier: 'DIRECT_RECIPIENT', value: SCORE_MODIFIERS.DIRECT_RECIPIENT });
  }
  if (signals.isOneToOne && !signals.isMailingList) {
    breakdown.push({ modifier: 'ONE_TO_ONE', value: SCORE_MODIFIERS.ONE_TO_ONE });
  }
  if (signals.isThread) {
    breakdown.push({ modifier: 'EXISTING_THREAD', value: SCORE_MODIFIERS.EXISTING_THREAD });
  }
  if (signals.threadLength >= 3) {
    breakdown.push({ modifier: 'LONG_THREAD', value: SCORE_MODIFIERS.LONG_THREAD });
  }
  if (signals.hasAttachment) {
    breakdown.push({ modifier: 'HAS_ATTACHMENT', value: SCORE_MODIFIERS.HAS_ATTACHMENT });
  }
  if (signals.isPersonalDomain) {
    breakdown.push({ modifier: 'PERSONAL_DOMAIN', value: SCORE_MODIFIERS.PERSONAL_DOMAIN });
  }
  if (signals.isHumanSender) {
    breakdown.push({ modifier: 'HUMAN_SENDER', value: SCORE_MODIFIERS.HUMAN_SENDER });
  }

  // Negative signals
  if (signals.isSelfSent) {
    breakdown.push({ modifier: 'SELF_SENT', value: SCORE_MODIFIERS.SELF_SENT });
  }
  if (signals.isCc) {
    breakdown.push({ modifier: 'CC_RECIPIENT', value: SCORE_MODIFIERS.CC_RECIPIENT });
  }
  if (signals.isBcc) {
    breakdown.push({ modifier: 'BCC_RECIPIENT', value: SCORE_MODIFIERS.BCC_RECIPIENT });
  }
  if (signals.isMailingList) {
    breakdown.push({ modifier: 'MAILING_LIST', value: SCORE_MODIFIERS.MAILING_LIST });
  }
  if (signals.isAutomated) {
    breakdown.push({ modifier: 'AUTOMATED_SENDER', value: SCORE_MODIFIERS.AUTOMATED_SENDER });
  }
  if (signals.isPlatform) {
    breakdown.push({ modifier: 'PLATFORM_DOMAIN', value: SCORE_MODIFIERS.PLATFORM_DOMAIN });
  }
  if (signals.isPlatformMediated) {
    breakdown.push({ modifier: 'PLATFORM_MEDIATED', value: SCORE_MODIFIERS.PLATFORM_MEDIATED });
  }
  if (signals.isHtmlOnly) {
    breakdown.push({ modifier: 'HTML_ONLY_EMAIL', value: SCORE_MODIFIERS.HTML_ONLY_EMAIL });
  }
  if (signals.recipientCount >= 5) {
    breakdown.push({ modifier: 'MANY_RECIPIENTS', value: SCORE_MODIFIERS.MANY_RECIPIENTS });
  }
  if (signals.isMarketingSubject) {
    breakdown.push({ modifier: 'MARKETING_SUBJECT', value: SCORE_MODIFIERS.MARKETING_SUBJECT });
  }

  // Gmail category
  if (signals.gmailCategory) {
    switch (signals.gmailCategory) {
      case 'primary':
        breakdown.push({ modifier: 'GMAIL_PRIMARY', value: SCORE_MODIFIERS.GMAIL_PRIMARY });
        break;
      case 'promotions':
        breakdown.push({ modifier: 'GMAIL_PROMOTIONS', value: SCORE_MODIFIERS.GMAIL_PROMOTIONS });
        break;
      case 'social':
        breakdown.push({ modifier: 'GMAIL_SOCIAL', value: SCORE_MODIFIERS.GMAIL_SOCIAL });
        break;
      case 'updates':
        breakdown.push({ modifier: 'GMAIL_UPDATES', value: SCORE_MODIFIERS.GMAIL_UPDATES });
        break;
      case 'forums':
        breakdown.push({ modifier: 'GMAIL_FORUMS', value: SCORE_MODIFIERS.GMAIL_FORUMS });
        break;
    }
  }

  return breakdown;
}

/**
 * Compute the priority score based on signals
 */
export function computeScore(signals: EmailSignals): number {
  const breakdown = getScoreBreakdown(signals);
  return breakdown.reduce((sum, item) => sum + item.value, 0);
}

/**
 * Assign a tier based on the computed score
 */
export function assignTier(score: number): EmailTier {
  if (score >= TIER_THRESHOLDS.HIGH) {
    return 'high';
  }
  if (score >= TIER_THRESHOLDS.MEDIUM) {
    return 'medium';
  }
  if (score >= TIER_THRESHOLDS.LOW) {
    return 'low';
  }
  return 'skip';
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Score a single email with metadata and raw headers
 */
export function scoreEmail(
  metadata: EmailMetadataWithHeaders,
  userEmail: string
): ScoredEmail {
  // Extract signals
  const signals = extractSignals(
    metadata.rawHeaders,
    userEmail,
    metadata.threadLength || 1,
    metadata.labelIds || [],
    metadata.snippet || ''
  );

  // Override hasAttachment from metadata
  signals.hasAttachment = metadata.hasAttachments;

  // Compute score and tier
  const score = computeScore(signals);
  const tier = assignTier(score);

  return {
    id: metadata.id,
    threadId: metadata.threadId,
    from: metadata.from,
    fromDomain: extractDomain(metadata.from),
    to: metadata.to,
    cc: metadata.cc || [],
    subject: metadata.subject,
    snippet: metadata.snippet,
    date: metadata.date,
    isUnread: metadata.isUnread,
    hasAttachments: metadata.hasAttachments,
    signals,
    score,
    tier,
  };
}

/**
 * Score multiple emails and return them sorted by score (highest first)
 */
export function scoreEmails(
  emails: EmailMetadataWithHeaders[],
  userEmail: string
): ScoredEmail[] {
  const scored = emails.map((email) => scoreEmail(email, userEmail));

  // Sort by score descending (highest priority first)
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Filter emails to only include those above a minimum tier
 */
export function filterByTier(
  emails: ScoredEmail[],
  minTier: EmailTier = 'low'
): ScoredEmail[] {
  const tierOrder: EmailTier[] = ['high', 'medium', 'low', 'skip'];
  const minIndex = tierOrder.indexOf(minTier);

  return emails.filter((email) => {
    const emailIndex = tierOrder.indexOf(email.tier);
    return emailIndex <= minIndex;
  });
}

/**
 * Get a summary of email tiers for logging/debugging
 */
export function getTierSummary(emails: ScoredEmail[]): Record<EmailTier, number> {
  const summary: Record<EmailTier, number> = {
    high: 0,
    medium: 0,
    low: 0,
    skip: 0,
  };

  for (const email of emails) {
    summary[email.tier]++;
  }

  return summary;
}
