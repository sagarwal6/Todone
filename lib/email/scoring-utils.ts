/**
 * Shared utility functions for email scoring and contact analysis.
 * Extracted from scoring.ts to avoid circular dependencies.
 */

/**
 * Extract email address from a formatted string like "Name <email@domain.com>"
 */
export function extractEmailAddress(formatted: string): string {
  const match = formatted.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : formatted.toLowerCase().trim();
}

/**
 * Parse a comma-separated list of email addresses
 */
export function parseEmailList(list: string | undefined): string[] {
  if (!list) return [];
  return list.split(',').map((e) => e.trim()).filter(Boolean);
}

/**
 * Check if the sender appears to be automated (noreply, platform emails, etc.)
 */
export function isAutomatedSender(from: string, replyTo?: string): boolean {
  const fromEmail = extractEmailAddress(from).toLowerCase();
  const replyToEmail = replyTo ? extractEmailAddress(replyTo).toLowerCase() : null;

  // Check for noreply patterns
  const noReplyPatterns = [
    /^no[-_]?reply@/i,
    /^donotreply@/i,
    /^noreply@/i,
    /^notifications?@/i,
    /^alerts?@/i,
    /^mailer[-_]?daemon@/i,
    /^postmaster@/i,
  ];

  if (noReplyPatterns.some((pattern) => pattern.test(fromEmail))) {
    return true;
  }

  // Check for platform/service sender patterns
  const platformSenderPatterns = [
    /^team@/i,
    /^hello@/i,
    /^hi@/i,
    /^support@/i,
    /^help@/i,
    /^info@/i,
    /^contact@/i,
    /^matching@/i,
    /^founders?@/i,
    /^community@/i,
    /^newsletter@/i,
    /^digest@/i,
    /^updates?@/i,
    /^news@/i,
    /^mail@/i,
    /^email@/i,
    /^members?@/i,
    /^apply@/i,
    /^admissions?@/i,
    /^outreach@/i,
    /^partnerships?@/i,
    /^events?@/i,
    /^invites?@/i,
    /^connect@/i,
    /^network@/i,
    /^daily@/i,
    /^weekly@/i,
    /^transactions?@/i,
    /^billing@/i,
    /^payments?@/i,
    /^receipts?@/i,
    /^orders?@/i,
  ];

  if (platformSenderPatterns.some((pattern) => pattern.test(fromEmail))) {
    return true;
  }

  // Check sender display name for newsletter patterns
  const senderNameLower = from.toLowerCase();
  const newsletterNamePatterns = [
    /daily\s*(digest|apps?|news|update)/i,
    /weekly\s*(digest|apps?|news|update|roundup)/i,
    /\bdigest\b/i,
    /\bnewsletter\b/i,
    /transaction\s*alerts?/i,
    /smart\s*goals?/i,
    /weekly\s*(goals?|recap|summary|check[\s-]*in)/i,
    /goal\s*(track|tracker|tracking|setting)/i,
    /\bhabit\b.*\b(track|log|check)/i,
    /accountability/i,
  ];
  if (newsletterNamePatterns.some((pattern) => pattern.test(senderNameLower))) {
    return true;
  }

  // If Reply-To differs from From domain, likely automated
  if (replyToEmail && replyToEmail !== fromEmail) {
    const fromDomain = extractEmailAddress(from).split('@')[1] || '';
    const replyToDomain = replyToEmail.split('@')[1] || '';
    if (fromDomain !== replyToDomain) {
      return true;
    }
  }

  // Company/brand sender: local part matches domain AND display name is a single word
  // e.g., "Venmo <venmo@venmo.com>", "Uber <uber@uber.com>"
  // Safe: "Andrew Lee <andrew@andrew.com>" has a two-word display name → not flagged
  const [localPart, domain] = fromEmail.split('@');
  if (localPart && domain) {
    const domainBase = domain.split('.')[0];
    const displayName = from.replace(/<[^>]+>/, '').trim();
    const displayNameWords = displayName.split(/\s+/).filter(Boolean);
    // Only flag if local part matches domain AND display name is a single word (brand, not person)
    // "Venmo <venmo@venmo.com>" → 1 word, matches → automated
    // "Andrew Lee <andrew@andrew.com>" → 2 words → NOT automated
    if (localPart === domainBase && displayNameWords.length <= 1) {
      return true;
    }
  }

  return false;
}
