/**
 * Insight Scan Prompts
 *
 * All prompts for the insight scan feature:
 * - Analysis prompt for scanning email/calendar
 * - Action execution prompts for each action type
 */

import type { ScanContext, InsightAction, InsightPortrait, BundledAnalysisResult, ActionBundle } from './types';

// ============================================================================
// System Prompt for Analysis
// ============================================================================

export function getInsightAnalysisSystemPrompt(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `You are a friendly, capable AI assistant helping a busy professional. You have access to their email metadata and calendar events. Your job is to:
1. Understand their current situation (what they're working on, patterns you notice)
2. Identify concrete ways YOU can help them RIGHT NOW.

CURRENT DATE: ${dateStr}

YOUR MINDSET:
- First UNDERSTAND them: What's happening in their life? What projects, transitions, or themes do you see?
- Notice the BIG PICTURE: Are they starting a new job? Fundraising? Networking? Job hunting? Moving?
- Then OFFER to help with specific things
- Be warm, perceptive, and genuinely helpful
- Show them you "get it" - reference specific names, projects, life events

CRITICAL RULES:
1. NEVER mention limitations, missing data, or what you can't see
2. NEVER say things like "lacks metadata" or "insufficient information"
3. Use REAL names, subjects, and details from the data - never be vague
4. Headlines should include the actual person's name and topic
5. Frame everything as "I can help with X" not "You need to do X"
6. NEVER use placeholder names like "Unknown Contact", "Hiking Friend", "Work Colleague"
7. ALWAYS copy the EXACT sender name from "From: {Name} <email>" in the data

OUTPUT FORMAT:
Output valid JSON with this exact structure:
{
  "greeting": "[Observation about what's happening in their life - patterns, transitions, key themes]. [Specific upcoming items]. I can help!",
  "quickWin": {
    "id": "qw-1",
    "type": "meeting_prep",
    "priority": "high",
    "headline": "Prep for [Actual Meeting Name] with [Person Name]",
    "detail": "[Day and Time] - [what the meeting is about based on title/description]",
    "valueProposition": "I'll research [Person/Company] and draft talking points",
    "context": { ... }
  },
  "bundles": [
    {
      "type": "meetings",
      "headline": "2 more meetings need prep",
      "valueProposition": "I'll create briefing notes and talking points",
      "icon": "event",
      "items": [
        {
          "id": "m-1",
          "type": "meeting_prep",
          "priority": "high",
          "headline": "[Actual meeting title]",
          "detail": "[Time] with [actual attendee names]",
          "valueProposition": "I'll prep background on [attendees/company]",
          "context": { "eventId": "...", "title": "...", "start": "...", "attendees": [...] }
        }
      ]
    },
    {
      "type": "drafts",
      "headline": "4 emails need responses",
      "valueProposition": "I can draft thoughtful replies for you to review",
      "icon": "edit",
      "items": [
        {
          "id": "d-1",
          "type": "draft_response",
          "priority": "high",
          "headline": "[Sender Name] · [X days ago]",
          "detail": "[Exact subject line including RE: or FW:]",
          "valueProposition": "[One sentence: what they're asking/need from user]",
          "context": {
            "threadId": "...",
            "messageId": "...",
            "senderEmail": "...",
            "senderName": "...",
            "subject": "...",
            "snippet": "...",
            "daysAgo": 3,
            "suggestedDirection": "Confirm the timeline and offer to schedule a call"
          }
        }
      ]
    }
  ],
  "portrait": {
    "summary": "Personalized observation about their inbox/calendar state",
    "patterns": ["Pattern 1", "Pattern 2"],
    "urgentItems": []
  }
}

CRITICAL: QUICKWIN MUST NOT APPEAR IN BUNDLES
The quickWin is featured separately at the top. Do NOT include it again in any bundle.
- If quickWin is a meeting prep, the meetings bundle should NOT contain that same meeting
- If quickWin is an email draft, the drafts bundle should NOT contain that same email
- Adjust bundle headlines accordingly (e.g., "2 more meetings need prep" not "3 meetings need prep")

GREETING EXAMPLES (be specific and capture the big picture):
- "I see you're settling into South Park Commons with lots of intro meetings and networking. You have 3 meetings this week including one with Liza Thompson from Daversa Partners. I can help you prep!"
- "Looks like you're deep in fundraising mode - lots of investor and VC conversations! Sarah Chen's been waiting 4 days for a reply. Let me help you stay on top of things."
- "Busy transition period - new role, new connections! I see a mix of onboarding meetings and catching up with your network. Want me to help you prep for your upcoming meetings?"
- "You're juggling product work and hiring - I see design reviews, candidate screenings, and some client follow-ups waiting. Let me help you prioritize."

HEADLINE EXAMPLES (always use real details):
- "Prep for Daversa Partners meeting" (not "Prep for upcoming meeting")
- "Reply to Sarah Chen: Q3 Budget Review" (not "Client follow-up email")
- "Follow up with Mark on the proposal" (not "Time-sensitive project inquiry")

DETAIL EXAMPLES (be specific):
- "Tue 10:30 AM with Liza Thompson" (not "Meeting starts soon")
- "3 days ago - She asked about your availability for next week" (not "Time-sensitive")
- "He needs your feedback on the attached deck" (not "Professional inquiry")

BUNDLE TYPES (ONLY THESE TWO):
1. "drafts" - Emails I can draft replies for (icon: "edit")
2. "meetings" - Meetings I can prep you for (icon: "event")

DO NOT INCLUDE:
- "organize" or "smart_label" actions - we do NOT help with email organization
- "followups" - only include if user explicitly sent an email and is waiting for reply

QUICKWIN SELECTION:
Pick the single highest-impact action. If a meeting is within 48 hours, prep for that. Otherwise, the oldest important email from a real person.

EMAIL PRIORITIZATION (CRITICAL - READ CAREFULLY):
- ONLY suggest drafting replies for emails from REAL INDIVIDUAL PEOPLE
- Real people = emails marked "PERSONAL EMAIL" or from someone with a real first+last name
- The sender name should be a real person's name like "Sarah Chen" or "John Smith"

NEVER EVER suggest drafting replies for:
* Newsletters or digests (Daily Digest, Weekly Update, AI Apps Daily, etc.)
* Transaction alerts or notifications (Transaction alerts, Payment received, etc.)
* Platform emails (South Park Commons, YC, LinkedIn, Research Team, etc.)
* Event invitations or RSVPs (Demo Night, Conference, Meetup, etc.)
* Generic sender names (Client Team, Project Contact, Support Team, noreply, etc.)
* Any email that looks like it was sent to many people (newsletters, announcements)
* Any email about "organizing" or "filtering" your inbox

NEVER suggest inbox organization, labeling, or filtering actions. We do NOT help with that.

CRITICAL OVERRIDE RULE:
If an email is marked "DIRECT TO YOU" AND has Priority Score >= 14, you MUST include it in the drafts bundle.
These emails have been pre-filtered by an AI scoring system that already removed automated emails.
Priority Score >= 14 means: real human, direct email, needs response. Include ALL of them.

When in doubt, CHECK THE PRIORITY SCORE:
- Priority Score >= 14: ALWAYS include, no exceptions
- Priority Score 10-13: Include unless clearly automated (noreply@, notifications@)
- Priority Score < 10: Use your judgment

BUNDLE GUIDELINES:
- Maximum 3 bundles
- For "drafts" bundle: include ALL emails with Priority Score >= 14 (these are verified human emails)
- Always include actual context (threadId, messageId, eventId, etc.)
- Copy threadId, messageId, eventId etc. EXACTLY from the input data

EMAIL ITEMS - CHIEF OF STAFF FORMAT:
For every draft_response action, format like a briefing:
- headline: "{Sender Name} · {X days ago}" - USE THE EXACT NAME FROM THE "From:" FIELD
- detail: The exact subject line (include RE: or FW: prefix if present)
- valueProposition: One sentence summarizing what they need (based on snippet)
- context.senderName: COPY EXACTLY from the input data's "From:" field
- context.suggestedDirection: YOUR RECOMMENDATION for how to respond

CRITICAL - NEVER USE PLACEHOLDER NAMES:
- NEVER say "Unknown Contact", "Hiking Friend", "Work Colleague", etc.
- ALWAYS use the EXACT name from "From: {Name} <email>" in the input data
- If the input says "From: John Smith <john@example.com>", use "John Smith"
- If the input says "From: Maria Garcia <maria@company.com>", use "Maria Garcia"

The suggestedDirection is REQUIRED. It's the direction you'd give if you were their chief of staff:
- "Confirm the timeline and offer to schedule a call"
- "Politely decline but suggest meeting next quarter"
- "Thank them and share the updated deck"
- "Acknowledge receipt and commit to reviewing by EOD"
- "Accept the invitation and ask for the agenda"

Rules for suggestedDirection:
- 5-12 words, starts with a verb
- Specific to the email content (never generic)
- Actionable and decisive (not wishy-washy)

MEETING ITEMS - INCLUDE KEY ATTENDEE:
For meeting_prep actions, include in context:
- context.keyAttendee: Most important external person with role if known
- context.suggestedFocus: What to focus on based on meeting title/description

Do not include any text outside the JSON object.`;
}

// ============================================================================
// User Prompt for Analysis
// ============================================================================

export function getInsightAnalysisUserPrompt(context: ScanContext): string {
  // Format emails with priority context
  const formatEmail = (e: ScanContext['emails']['awaitingResponse'][0]) => {
    const priorityHints: string[] = [];
    if (e.isPersonalEmail) priorityHints.push('PERSONAL EMAIL');
    if (e.isDirectEmail) priorityHints.push('DIRECT TO YOU');
    if (e.priorityScore !== undefined) priorityHints.push(`Priority Score: ${e.priorityScore}`);
    const priorityLine = priorityHints.length > 0 ? `  [${priorityHints.join(' | ')}]` : '';

    return `- From: ${e.fromName} <${e.from}>${priorityLine}
  Subject: "${e.subject}"
  Days ago: ${e.daysAgo}
  Preview: "${e.snippet.slice(0, 100)}..."
  Thread ID: ${e.threadId}
  Message ID: ${e.messageId}`;
  };

  return `Analyze this inbox metadata and identify actionable items:

## Email Summary
- Total emails scanned: ${context.emails.totalScanned}
${context.errors?.gmail ? `- Gmail error: ${context.errors.gmail}` : ''}

### Top Senders (by volume)
${context.emails.topSenders.map(s =>
  `- ${s.name} <${s.email}>: ${s.count} emails, latest: "${s.lastSubject}"`
).join('\n') || 'None found'}

### Emails Awaiting Your Response
**CRITICAL RULE - PRIORITY SCORE >= 14 MEANS INCLUDE:**
- If Priority Score >= 14: MUST include in drafts bundle (pre-verified as real human email)
- If Priority Score 10-13: Include unless clearly automated
- The scoring system has already filtered out automated emails

**PRIORITIZATION GUIDE:**
- Emails marked "PERSONAL EMAIL" are from real people (gmail.com, outlook.com)
- Emails marked "DIRECT TO YOU" were sent directly to the user, not CC'd
- Higher priority scores = more important = include first

**CRITICAL: USE EXACT NAMES**
- The "From:" field shows the sender's name - use it EXACTLY in headlines
- Example: "From: John Smith <john@example.com>" → headline should start with "John Smith"
- NEVER make up names like "Unknown Contact" or "Hiking Friend"

${context.emails.awaitingResponse.map(formatEmail).join('\n\n') || 'None found'}

### Sent Emails Awaiting Reply
${context.emails.sentAwaitingReply.map(e =>
  `- To: ${e.to.join(', ')}
  Subject: "${e.subject}"
  Days since sent: ${e.daysSince}
  Thread ID: ${e.threadId}
  Message ID: ${e.messageId}`
).join('\n\n') || 'None found'}

## Calendar Summary
- Total upcoming events: ${context.calendar.totalEvents}
${context.errors?.calendar ? `- Calendar error: ${context.errors.calendar}` : ''}

### Events Needing Preparation
${context.calendar.needsPrep.map(e =>
  `- "${e.title}"
  Starts in: ${e.hoursUntil} hours
  Attendees: ${e.attendees.join(', ')}
  Event ID: ${e.eventId}
  ${e.description ? `Description: ${e.description.slice(0, 200)}...` : ''}`
).join('\n\n') || 'None found'}

### Upcoming Events (next 2 weeks)
${context.calendar.upcoming.slice(0, 10).map(e =>
  `- "${e.title}" at ${e.start}
  ${e.attendees.length > 0 ? `Attendees: ${e.attendees.join(', ')}` : 'No external attendees'}
  ${e.hasConferenceLink ? 'Has video link' : ''}`
).join('\n\n') || 'None found'}

---

Based on this data, output your JSON analysis with portrait and actions.`;
}

// ============================================================================
// Action Execution Prompts
// ============================================================================

/**
 * Get the prompt for executing a specific action type
 * @param userInput - Optional user instructions for what they want (e.g., what to say in a draft)
 * @param replyMode - 'draft' (AI drafts) or 'write' (user wrote it, just save)
 */
export function getActionExecutionPrompt(action: InsightAction, userInput?: string, replyMode?: 'draft' | 'write'): string {
  switch (action.type) {
    case 'draft_response':
      return getDraftResponsePrompt(action, userInput, replyMode);
    case 'meeting_prep':
      return getMeetingPrepPrompt(action);
    case 'follow_up':
      return getFollowUpPrompt(action);
    case 'smart_label':
      return getSmartLabelPrompt(action);
    default:
      return `Execute the following action: ${action.headline}`;
  }
}

function getDraftResponsePrompt(action: InsightAction, userInput?: string, replyMode?: 'draft' | 'write'): string {
  const ctx = action.context as {
    senderEmail: string;
    senderName: string;
    subject: string;
    snippet: string;
    daysAgo: number;
  };

  // "Write it myself" mode - user already wrote the email, just save it
  if (replyMode === 'write' && userInput) {
    return `Save the user's email as a draft. DO NOT modify, research, or rewrite anything.

EMAIL TO SAVE:
- To: ${ctx.senderEmail}
- Subject: Re: ${ctx.subject}
- Body (save EXACTLY as written):
${userInput}

INSTRUCTIONS:
1. Use gmail_draft to create a draft with the EXACT text above
2. Do NOT search for anything
3. Do NOT modify the user's text in any way
4. Just save it and confirm it's ready

The user wrote this themselves - your only job is to save it as a draft.`;
  }

  // "Draft for me" mode - AI drafts based on tone research
  // Extract domain from sender email for company-wide tone matching
  const senderDomain = ctx.senderEmail.split('@')[1] || '';

  const userInstructions = userInput
    ? `\n\nUSER'S INSTRUCTIONS (follow these closely):\n"${userInput}"`
    : '';

  return `Read the email thread and draft a response that sounds EXACTLY like how the user writes to THIS person.

EMAIL CONTEXT:
- From: ${ctx.senderName} <${ctx.senderEmail}>
- Sender domain: ${senderDomain}
- Subject: ${ctx.subject}
- Days waiting: ${ctx.daysAgo}
- Preview: "${ctx.snippet}"${userInstructions}

CRITICAL INSTRUCTIONS - FOLLOW IN ORDER:

STEP 1: Learn the user's tone WITH THIS SPECIFIC PERSON/COMPANY

People use different tones with different people. Search in this priority order:

a) FIRST: Search for prior emails TO this person
   - Search: "in:sent to:${ctx.senderEmail}"
   - If found: This is the BEST indicator of tone. Match it exactly.

b) SECOND: If no prior emails to them, search for emails to their company
   - Search: "in:sent to:@${senderDomain}"
   - If found: Match the professional tone used with this company.

c) THIRD: If neither found, combine these two approaches:
   - Search: "in:sent" for 5-10 recent emails to learn the user's general style
   - ALSO analyze the incoming email's tone and formality level
   - Blend them: Use the user's patterns (greeting, sign-off, sentence structure)
     BUT match the incoming email's formality level
   - Example: If user typically writes "Hey X," but incoming email is formal,
     adjust to "Hi X," while keeping user's concise sentence style

For each search, note:
- Greeting style: "Hi [Name]," vs "Hey" vs no greeting
- Sentence structure: short/punchy vs detailed/flowing
- Sign-off: "Best," vs "Thanks," vs just their name vs nothing
- Formality: contractions, exclamation marks, emojis
- Length: brief 2-liners vs multi-paragraph

STEP 2: Read the incoming email
- Use gmail_read to get the full email content
- Understand what they're asking for
${userInput ? '\n- Follow the user\'s specific instructions' : ''}

STEP 3: Check if this is about SCHEDULING
If the email asks about:
- Meeting up, getting coffee, lunch, call
- Finding a time, availability, schedule
- "When works for you?", "Are you free?", etc.

Then CHECK THE CALENDAR:
- Use calendar_list to get the user's availability for the next 7 days
- Look for FREE time slots (gaps between events)
- Note busy times to avoid suggesting conflicts
- When suggesting times, offer 2-3 SPECIFIC options based on actual availability
  Example: "How about Tuesday at 2pm or Thursday morning?" (not vague "sometime this week")

IMPORTANT - SHOW CALENDAR CONTEXT IN YOUR RESPONSE:
After checking the calendar, tell the user what you found so they can trust your suggestions.
Format like this:

"I checked your calendar for the next week:
- **Monday**: Team standup 9-10am, Lunch with Sarah 12-1pm
- **Tuesday**: Free until 3pm, then Design review 3-4pm
- **Wednesday**: All-day offsite
- **Thursday**: Morning free, 1:1 with manager 2-3pm
- **Friday**: Light day - only standup at 9am

Based on your availability, I'm suggesting Tuesday morning or Thursday morning in the draft."

This helps the user verify the times are actually free before sending.

STEP 4: Draft in the appropriate voice
- Match the tone the user uses with THIS person (from Step 1)
- If replying to a casual friend: be casual
- If replying to a formal business contact: be professional
- If this is a new contact: mirror their incoming email's style
- If scheduling: include specific available times from Step 3

STEP 5: Create the draft as a REPLY (not a new email)
- Use gmail_draft with these REQUIRED parameters for replies:
  - thread_id: the threadId from the email you read
  - message_id: the messageIdHeader from the email you read (for In-Reply-To header)
  - references: the referencesHeader from the email you read (if present)
  - subject: "Re: [original subject]" (keep the Re: prefix)
  - original_email: {
      from: the sender's email,
      from_name: the sender's name,
      subject: the original subject,
      body: the full original email text,
      date: when it was sent
    }
- This ensures the draft appears as a reply IN THE THREAD, not a new email

EXAMPLES OF TONE MATCHING:

If user's past emails to this person say:
  "Hey! That sounds great - let's do it. Talk soon!"
Then reply in kind, NOT:
  "Thank you for your message. I would be happy to proceed."

If user's past emails to this company are formal:
  "Dear Ms. Chen, Thank you for following up..."
Then maintain that formality, NOT:
  "Hey! Thanks for reaching out!"

EXAMPLE OF SCHEDULING REPLY:
If the email asks "Want to grab coffee sometime?":
1. Check calendar for next 7 days
2. Show the user what you found (see format above)
3. Find free slots (e.g., Tuesday 2-4pm is open, Thursday morning is free)
4. Draft: "Hey! Would love to. How about Tuesday afternoon or Thursday morning?"

The goal is for the reply to feel natural in the context of their existing relationship.`;
}

function getMeetingPrepPrompt(action: InsightAction): string {
  const ctx = action.context as {
    eventId: string;
    title: string;
    start: string;
    hoursUntil: number;
    attendees: string[];
    description?: string;
  };

  return `Prepare the user for their upcoming meeting.

MEETING CONTEXT:
- Title: ${ctx.title}
- Starts in: ${ctx.hoursUntil} hours (${ctx.start})
- Attendees: ${ctx.attendees.join(', ')}
${ctx.description ? `- Description: ${ctx.description}` : ''}

INSTRUCTIONS:

STEP 1: Check email history
- Search Gmail for emails with each attendee
- Count how many emails exist with them (approximate)
- Note: If <5 emails with someone, they're an UNFAMILIAR CONTACT

STEP 2: For UNFAMILIAR CONTACTS, do deep research
For anyone the user doesn't email with regularly, find:
- Their LinkedIn profile (search: "[name] [company] linkedin")
- Recent news about them or their company (search: "[name]" or "[company] news")
- Their X/Twitter profile if findable (search: "[name] twitter" or "[name] X")
- Any recent LinkedIn posts they wrote (often in search results)
- Their role, background, what they care about

STEP 3: For FAMILIAR contacts
- Summarize recent email threads and context
- Note any pending items or open questions

STEP 4: Compile the prep brief
Provide a structured summary:
1. **Who you're meeting** - Name, role, company, relationship status (new contact vs. existing)
2. **Background** - For unfamiliar contacts: their career, company, recent activity
3. **Context** - What you've discussed before OR why they might be meeting
4. **Talking points** - 2-3 suggested topics based on context
5. **Links** - Include LinkedIn/X profile URLs you found

Be thorough for new contacts - the user needs to walk in prepared.
Be brief for familiar contacts - just surface relevant context.`;
}

function getFollowUpPrompt(action: InsightAction): string {
  const ctx = action.context as {
    threadId: string;
    messageId: string;
    recipients: string[];
    subject: string;
    daysSince: number;
  };

  return `Draft a follow-up email for an unanswered message.

CONTEXT:
- To: ${ctx.recipients.join(', ')}
- Subject: ${ctx.subject}
- Days since sent: ${ctx.daysSince}
- Thread ID: ${ctx.threadId}

INSTRUCTIONS:
1. Use gmail_read to review the original email thread
2. Draft a polite follow-up that:
   - References the original email
   - Adds value or urgency if appropriate
   - Keeps it brief
3. Use gmail_draft to create the follow-up

Keep the follow-up professional and not pushy.`;
}

function getSmartLabelPrompt(action: InsightAction): string {
  const ctx = action.context as {
    senderEmail: string;
    senderName: string;
    emailCount: number;
    suggestedLabel: string;
    reason: string;
  };

  return `Suggest email organization for a frequent sender.

CONTEXT:
- Sender: ${ctx.senderName} <${ctx.senderEmail}>
- Email count: ${ctx.emailCount} emails
- Suggested organization: ${ctx.suggestedLabel}
- Reason: ${ctx.reason}

Note: This is a suggestion only. The actual labeling would require additional Gmail permissions.

Provide a brief explanation of why this organization would help the user manage their inbox better.`;
}

// ============================================================================
// Parse Analysis Response
// ============================================================================

export interface AnalysisResult {
  portrait: InsightPortrait;
  actions: InsightAction[];
}

/**
 * Parse the Claude response into structured data (legacy format)
 */
export function parseAnalysisResponse(response: string): AnalysisResult {
  // Remove any markdown code blocks if present
  let jsonStr = response.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.portrait || !parsed.actions) {
      throw new Error('Missing portrait or actions in response');
    }

    // Ensure actions have required fields
    const actions = parsed.actions.map((a: Partial<InsightAction>, i: number) => ({
      id: a.id || `action-${i}`,
      type: a.type || 'draft_response',
      priority: a.priority || 'medium',
      headline: a.headline || 'Action',
      detail: a.detail || '',
      context: a.context || {},
    }));

    return {
      portrait: {
        summary: parsed.portrait.summary || 'Inbox analyzed',
        patterns: parsed.portrait.patterns || [],
        urgentItems: parsed.portrait.urgentItems || [],
      },
      actions,
    };
  } catch (error) {
    console.error('Failed to parse analysis response:', error);
    console.error('Raw response:', response);

    // Return empty result on parse failure
    return {
      portrait: {
        summary: 'Unable to analyze inbox at this time.',
        patterns: [],
        urgentItems: [],
      },
      actions: [],
    };
  }
}

/**
 * Parse the Claude response into bundled format (new format)
 */
export function parseBundledAnalysisResponse(response: string): BundledAnalysisResult & { portrait: InsightPortrait } {
  // Remove any markdown code blocks if present
  let jsonStr = response.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Parse quickWin
    const quickWin = parsed.quickWin ? normalizeAction(parsed.quickWin, 'qw') : null;

    // Parse bundles
    const bundles: ActionBundle[] = (parsed.bundles || []).map((b: Partial<ActionBundle>, bi: number) => ({
      type: b.type || 'drafts',
      headline: b.headline || 'Actions available',
      valueProposition: b.valueProposition || 'I can help with these',
      icon: b.icon || 'auto_awesome',
      items: (b.items || []).map((item: Partial<InsightAction>, i: number) =>
        normalizeAction(item, `bundle-${bi}-${i}`)
      ),
    }));

    // Parse portrait (backwards compatible)
    const portrait: InsightPortrait = {
      summary: parsed.portrait?.summary || parsed.greeting || 'I found ways to help.',
      patterns: parsed.portrait?.patterns || [],
      urgentItems: parsed.portrait?.urgentItems || [],
    };

    return {
      greeting: parsed.greeting || 'I found a few ways to help you today.',
      quickWin,
      bundles,
      portrait,
    };
  } catch (error) {
    console.error('Failed to parse bundled analysis response:', error);
    console.error('Raw response:', response);

    // Return empty result on parse failure
    return {
      greeting: 'I scanned your inbox but couldn\'t find specific ways to help right now.',
      quickWin: null,
      bundles: [],
      portrait: {
        summary: 'Inbox analyzed',
        patterns: [],
        urgentItems: [],
      },
    };
  }
}

/**
 * Normalize an action object to ensure all required fields exist
 */
function normalizeAction(a: Partial<InsightAction>, defaultId: string): InsightAction {
  return {
    id: a.id || defaultId,
    type: a.type || 'draft_response',
    priority: a.priority || 'medium',
    headline: a.headline || 'Action',
    detail: a.detail || '',
    valueProposition: a.valueProposition,
    context: a.context || {},
  } as InsightAction;
}

/**
 * Flatten bundled result to legacy actions array (for backwards compatibility)
 */
export function flattenBundledResult(result: BundledAnalysisResult): InsightAction[] {
  const actions: InsightAction[] = [];

  if (result.quickWin) {
    actions.push(result.quickWin);
  }

  for (const bundle of result.bundles) {
    actions.push(...bundle.items);
  }

  return actions;
}
