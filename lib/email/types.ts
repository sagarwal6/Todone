/**
 * Email Signal Scoring Types
 *
 * Types for the email priority scoring layer that runs BEFORE
 * emails are sent to the LLM, reducing noise and saving tokens.
 */

/**
 * Signals extracted from email headers for scoring
 */
export interface EmailSignals {
  isDirect: boolean;          // user is sole To: recipient (or one of 2-3)
  isCc: boolean;              // user is in CC
  isBcc: boolean;             // user is in BCC
  isMailingList: boolean;     // has List-Unsubscribe header
  isAutomated: boolean;       // noreply sender or platform sender pattern
  isPlatform: boolean;        // from a known platform domain (YC, LinkedIn, etc.)
  isPlatformMediated: boolean; // sender name indicates platform mediation ("via X", "from X team")
  isHtmlOnly: boolean;        // pure HTML email with no meaningful text (newsletters)
  isPersonalDomain: boolean;  // from gmail.com, outlook.com, etc. (likely real person)
  isHumanSender: boolean;     // no automation flags (not automated, not platform, not mailing list, not HTML-only)
  isSelfSent: boolean;        // user sent this to themselves (reminder)
  isOneToOne: boolean;        // exactly 1 sender, 1 recipient
  recipientCount: number;     // total To + CC recipients
  isThread: boolean;          // part of an existing conversation
  threadLength: number;       // number of messages in thread
  hasAttachment: boolean;
  isMarketingSubject: boolean; // subject matches promo patterns
  // Gmail category labels
  gmailCategory?: 'primary' | 'social' | 'promotions' | 'updates' | 'forums';
}

/**
 * Priority tier for email scoring
 * - high: Direct, important emails that need attention
 * - medium: Relevant but not urgent
 * - low: Background noise, FYI emails
 * - skip: Marketing, automated, can be filtered out
 */
export type EmailTier = 'high' | 'medium' | 'low' | 'skip';

/**
 * Extended email metadata with scoring information
 */
export interface ScoredEmail {
  id: string;
  threadId: string;
  from: string;
  fromDomain: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  hasAttachments: boolean;
  signals: EmailSignals;
  score: number;
  tier: EmailTier;
}

/**
 * Raw headers extracted from Gmail API for scoring
 */
export interface RawEmailHeaders {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  listUnsubscribe?: string;
  inReplyTo?: string;
  references?: string;
  subject: string;
}

/**
 * Extended email metadata that includes raw headers for scoring
 */
export interface EmailMetadataWithHeaders {
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
  rawHeaders: RawEmailHeaders;
  threadLength?: number;
  labelIds?: string[];  // Gmail labels including CATEGORY_PROMOTIONS, etc.
}
