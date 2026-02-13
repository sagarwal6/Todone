# TODONE
## Product Brief v4.1
*The AI to-do list that reads your mind*

---

## Executive Summary

Todone is an AI-powered task management system that transforms how people execute on their to-do lists. Unlike traditional task managers that simply track what needs to be done, Todone automatically researches each task and provides a CEO-style briefing with context, next steps, and actionable links—all within 8 seconds of task creation.

**The Core Insight**: People don't need help remembering their tasks. They need help *executing* them. The real friction isn't capturing "switch car insurance"—it's spending 30 minutes researching providers, finding your policy number, and comparing options.

Todone eliminates that friction by doing the research instantly and automatically, turning every to-do list into an action-ready briefing.

---

## The Problem

### For Individuals
Most to-do apps fail at the critical moment: they track what you need to do, but don't reduce the friction of actually doing it. When you add "switch car insurance" to your list, it just sits there while the real work of researching providers, finding your policy number, and understanding your options remains undone.

### For Enterprise Users (Phase 3+)
Knowledge workers are drowning in fragmented action items across tools:
- "Can you look into this?" buried in a Slack thread
- Action items from meeting notes that never get captured
- Jira tickets assigned but context scattered across 5 different channels
- Email requests that get lost in the inbox
- Calendar invites with prep work that never happens

---

## The Insight

Two friction points kill productivity:
1. **Discovery**: Finding and consolidating all your action items across tools
2. **Preparation**: Gathering the context and information needed to actually complete them

People don't need AI to do their tasks—they need AI to surface tasks automatically and remove the friction so they can execute in seconds instead of spending 30 minutes on research and context-gathering.

---

## The Solution: Todone

Todone is an AI-native task management system with two superpowers:
1. **Manual task input** (Phase 1): Type any task, get instant research
2. **Auto-population** (Phase 3+): Connects to your tools and automatically surfaces action items, deadlines, and commitments

---

## The Magic Moment

The first 8 seconds after a user adds a task define whether they trust Todone.

### Example Flow
```
User types: "Book dentist appointment"

[0-8 seconds later]

✨ Card expands to reveal:
- Your dentist: Dr. Sarah Chen, Smile Dental
- Last visit: 6 months ago (cleaning due)
- Available slots: Tomorrow 2pm, Friday 10am
- Insurance: Covered under Delta Dental

[Book Now] [Add to Calendar] [Remind Me Later]
```

### Design Elements That Create Magic
- **Progressive reveal** (not just a loading spinner)
- **Confidence indicators** (shows it's "thinking" not "stuck")
- **Proactive follow-up questions** ("Should I check your email for...?")
- **Generated action UI** unique to each task type
- **Source verification** (every fact cites its source)

### The "Wow" Reaction We're Designing For
*"Wait, it already knows I probably need a plumber OR a DIY fix, found YouTube tutorials for my faucet type, AND is asking if I want it to check my email for home warranty info?"*

---

## Key Differentiator

Traditional to-dos are **write-only**. You capture tasks but still have to context-switch to execute them.

Todone is **read-write**. The AI anticipates what you'll need and surfaces it instantly—without you having to ask.

---

## Generated Action UI

A key differentiator: Todone generates a custom UI for each task's next steps. This isn't just text—it's an interactive interface tailored to the task type.

### Dynamic Action Generation (CRITICAL)
- **Never use predefined templates** - AI determines appropriate UI for each task
- Gemini uses function calling to identify task type and generate 1-3 contextual actions
- Button types adapt based on briefing content:
  - Links (websites, booking pages)
  - Communication (pre-filled email/text)
  - Calendar events (with pre-populated details)
  - Quick actions (copy phone number, open map)
  - Nested actions (show more options dropdown)
- **Fallback**: If AI can't determine useful actions, show generic [Open Link] or no buttons (just briefing text)

### Examples by Task Type

**Insurance Task**: "Switch to cheaper car insurance"
```
Current: Geico • Policy #GK-4821 • Expires March 15
Estimated savings: $420/year by switching

[Get Quote from Progressive]
[Compare 5 providers]
[View policy details]

Sources: Your Geico email (Jan 10), NerdWallet
```

**Appointment Task**: "Schedule dentist cleaning"
```
Your dentist: Dr. Sarah Chen, Smile Dental
Last visit: 6 months ago
Available: Tomorrow 2pm, Friday 10am

[Call: (555) 123-4567]
[Book online]
[Add reminder]

Sources: Your calendar, Smile Dental website
```

**Home Repair Task**: "Fix leaky faucet"
```
DIY Option: Likely a worn washer ($3 part, 20 min fix)
Professional: $150-300 for plumber visit

[Watch DIY video]
[Find local plumbers]
[Check home warranty]

Sources: YouTube (This Old House), HomeAdvisor
```

**Purchase Task**: "Buy standing desk"
```
Top-rated: Uplift V2 ($599), Fully Jarvis ($569)
Key features: Height range 25-51", 275lb capacity

[Compare on Amazon]
[View on Uplift $599]
[Read Wirecutter review]

Sources: Wirecutter, Amazon reviews
```

**Research Task**: "Learn about React 19 features"
```
Major updates: Actions, Server Components stable
Breaking: Deprecated lifecycle methods removed

[Read official docs]
[View migration guide]
[See code examples]

Sources: React.dev, Dan Abramov's blog
```

**Personal/Ambiguous Task**: "Call mom"
```
[No briefing - personal task, shows in inbox with 💭 icon]
Task saved, no research needed.
```

### Key Principles for Generated UI
- Every element is actionable (no dead text)
- Source links visible for verification
- One-tap actions where possible (call, email, open link)
- Consistent patterns across task types, but tailored content
- **All actions generated dynamically** - no predefined templates

---

## Task Research Logic

### When Research Happens
- **Gemini evaluates if task requires external research** on creation
- Tasks that GET research: Anything requiring external information
  - Bookings, purchases, how-tos, local services, product info
- Tasks that SKIP research: Personal/ambiguous tasks without external context
  - Examples: "Call mom", "Think about vacation", "Decide on paint color"

### UI Treatment for Non-Researched Tasks
- Task saves normally to inbox
- No briefing generated
- Shows subtle "💭" icon or "No research needed" badge
- Card stays collapsed but functional (user can add notes, set reminders, mark complete)
- **Key UX principle**: Silence = success. If no briefing appears, the task is stored safely, just doesn't need AI help

### Benefits
- Saves ~30% of API calls by skipping unnecessary research
- Sets user expectations correctly
- Respects that not every task needs AI assistance

---

## Search Strategy

### Phase 1 MVP: Gemini's Built-in Google Search
**Why start here:**
- Native grounding with citations (reduces hallucinations)
- Lower latency (single API loop, no external calls)
- Cost-effective (bundled with model call)
- Simpler for rapid development
- Enable "Grounding" mode for real URL citations

**Implementation:**
- Use Gemini 2.0 Flash with Google Search tool
- Research happens on task creation (if task requires it)
- Progressive reveal UI during 0-8 second research window
- Cache results for 24 hours to avoid duplicate research

### Phase 2+: Consider Specialized Search
**When to upgrade**: After 100+ users, when seeing demand for:
- Complex multi-source research queries
- Structured data extraction (local services, price comparisons)
- Domain-specific crawling (insurance sites, contractor databases)

**Options to consider:**
- **Tavily/Exa**: Better for deep research, clean Markdown/JSON output
- **Firecrawl**: For reading specific policy documents/websites

**Hybrid approach** (recommended for scale):
- Gemini Search for quick facts and general queries
- Tavily/Exa for complex research tasks requiring multiple sources
- Firecrawl for document-heavy tasks

---

## Source Verification & Trust

Every piece of research must be verifiable. Users need to trust the information before acting on it.

### Verification UI Pattern
- **Source badge**: Every fact shows where it came from (e.g., "via Geico.com", "from your email on Jan 15")
- **Verify button**: One-tap link to the original source (opens in new tab)
- **Confidence indicator**: Visual cue for certainty level (solid = high confidence, dotted = best guess)
- **"Report incorrect" link**: Easy feedback path if something is wrong

### Example Display
```
Policy #GK-4821 • Expires March 15 • via your Geico email (Jan 10)
[Verify ↗] [Report incorrect]
```

### Error Handling & Confidence Levels
**Key principles:**
- Never hallucinate specifics (numbers, dates, names)
- Always attribute sources when possible
- "Best guess" okay for recommendations, NOT for personal data
- Offer to retry with more context

**Example error states:**
- "Couldn't find your current provider - can you share your last insurance email?"
- "Found 3 dentists nearby, but couldn't verify your preferred one"
- "This task might need more context - what specifically are you looking for?"

---

## MVP Scope (4 weeks with Claude Code)

### Phase 1: Instant Research (Weeks 1-2)

**Core User Flow:**
1. User types task in inbox
2. Task saved to localStorage immediately
3. Background: Gemini 2.0 Flash + Google Search researches task (if needed)
4. Card expands with briefing in <8 seconds
5. User reviews generated actions, takes action, or defers

**Technical Stack:**
- **Frontend**: React/Next.js (web-first, PWA later)
- **Storage**: localStorage for MVP (migrate to Supabase in Phase 2)
- **AI**: Gemini 2.0 Flash with built-in Google Search tool
- **Auth**: Clerk (pre-built UI, social logins, 10K free MAU)
- **Deployment**: Vercel

**Features Included:**
- Manual task input (text field)
- Instant research on task creation (with smart skip logic)
- Progressive reveal animation (0-8 seconds)
- CEO-briefing summary under each task
- Dynamically generated action UI per task type
- Source links with [Verify] buttons
- Drag-and-drop task reordering
- Complete / Archive task actions
- 👍/👎 feedback on research quality
- Basic persistence (localStorage scoped to user ID)

**Offline Handling:**
- Tasks always save to localStorage immediately
- Show "Researching..." state if online
- If offline: Show "Will research when online" badge
- Queue research requests for when connection returns
- Consider service worker for PWA in Phase 2

**Cost Management:**
- Cache research results for 24 hours (avoid re-researching same task)
- Use Gemini Flash (cheapest tier) for MVP
- Set per-user daily research limit (10 tasks/day initially)
- Skip research for personal/ambiguous tasks (saves ~30% of API calls)

**Privacy Compliance:**
- No user accounts required for basic usage
- Clear privacy policy: "We send your task text to Gemini for research"
- Option to "Research without context" (no personal data sent)
- Phase 2: Encrypted personal context storage

**NOT in Phase 1:**
- No integrations/connectors (Gmail, Slack, etc.)
- No auto-population of tasks
- No per-task chat
- No team features
- No mobile apps

**Success Criteria:**
- Users say "wow" at the research quality
- 95% of research briefs load in <8 seconds
- >60% thumbs up on research quality
- 80% of generated actions are useful (user clicks action button)
- Users complete tasks 2x faster than with regular to-do app
- Users return 3+ times in first week

---

### Phase 2: Personal Memory (Weeks 3-4)

**Goal**: Deepen engagement through context and conversation.

**New Capabilities:**
- User profile: Preferences, location, frequent contacts
- Context injection: "Book dentist" knows YOUR dentist
- Task history: Learn from past completions
- Per-task chat thread (ask follow-up questions, refine research)
- Global chat (ask about any task, cross-task context)
- Research depth settings (quick vs. thorough)
- Integration prep: OAuth scaffolding for Gmail/Calendar

**Storage Architecture Decision:**

**Recommended: Hybrid Approach**
- **Relational Database** (Supabase Postgres):
  - For: Core task data, user profiles, integration mappings
  - Pros: Structured queries, ACID compliance, easier debugging
- **Vector Database** (Supabase pgvector):
  - For: Personal context, task history, semantic search
  - Pros: Better AI retrieval, semantic similarity, scalable embeddings
- **Sync strategy**: Keep both databases in sync for optimal performance

**Task De-duplication (Foundation):**
- Use embeddings to identify semantically similar tasks
- Threshold: 0.85+ similarity = potential duplicate
- **UI Treatment**:
  - Show "Related Tasks" section in briefing
  - Display: "Possible duplicate: [Task from earlier]"
  - User options: Merge, Link, or Mark as Separate
- **Note**: Auto-merge comes in Phase 3 with integrations

**Success Criteria:**
- >30% of users use per-task chat
- Memory recall accuracy >80%
- Returning user rate increases
- Personal context correctly applied in 90%+ of tasks

---

### Phase 3: Integrations (Post-MVP, Weeks 5-10)

**Goal**: Prove auto-population value. Test the Inbox → List flow.

**Core Features:**
- Gmail, Slack, Linear, Google Calendar integrations
- Auto-detection of action items from connected sources
- Inbox zone for triage (separate from confirmed list)
- Calendar-based tasks (prep for meetings, deadline reminders)
- Cross-source context in research
- Integration settings (per-channel sensitivity, include/exclude)

**Multi-source De-duplication:**
- **Detection**: Embedding-based similarity across all sources
- **UI Treatment**:
  - "Related Sources" showing task origins (Gmail, Slack, Jira)
  - Smart merging: Combine context from multiple sources into single briefing
- **Auto-merge criteria**:
  - Same task across 3+ sources within 24 hours
  - Exact text match from integrated apps
  - User can disable auto-merge in settings
- **User control**: "Always merge from these sources" preferences

**Inbox Zone (Triage):**
Auto-detected potential tasks from connected tools. User reviews and decides.
- Shows source (Slack, Email, Linear, Calendar)
- Quick actions: [Add to List] [Dismiss] [Not a task] [Already done] [Snooze]
- Bulk actions: "Add all" / "Dismiss all from this channel"
- Badge count shows pending items
- NO research yet—saves API costs, respects user intent

**My List Zone (Confirmed Tasks):**
Tasks the user has committed to. Research kicks in here.
- CEO-briefing summary visible under each task
- Expandable generated action UI
- Drag-and-drop reordering (user controls priority)
- Per-task chat thread for follow-up questions
- Complete / Archive actions

**Success Criteria:**
- >50% of auto-detected tasks accepted
- <20% "Not a task" rate
- Average user connects 2+ integrations
- Users report Todone as "source of truth"
- Users report finding tasks they would have missed

---

## Non-Goals for MVP

- Mobile apps (web-first, PWA later)
- Real-time collaboration
- Recurring tasks
- Sub-tasks / projects
- Third-party integrations (save for Phase 3)
- Predefined action templates (all actions generated dynamically by AI)
- AI-executed actions (human-in-the-loop for all V1)

---

## Success Metrics

### Engagement
- DAU/WAU ratio
- Tasks created per user per week
- Auto-detected task acceptance rate (Phase 3+)
- Chat usage rate (Phase 2+)

### Value
- **Speed**: 95% of research briefs load in <8 seconds
- **Accuracy**: 80% of generated actions are useful (user clicks action button)
- Research quality: % thumbs up
- Time from task creation to completion
- Link click-through rate on research

### Growth
- **Retention**: Users return 3+ times in first week
- Integrations connected per user (Phase 3+)
- Team invites / viral coefficient (Phase 5+)
- Free → Pro conversion rate

### Efficiency
- **Cost efficiency**: 30% reduction in API calls from skipping personal/ambiguous task research
- Users complete tasks 2x faster than traditional to-do apps

---

## Tone & Style Guide

Todone speaks like a professional chief of staff: confident, proactive, concise, and encouraging.

### Voice Characteristics
- **Confident but not arrogant**: States facts clearly, acknowledges uncertainty honestly
- **Proactive, not passive**: Anticipates needs, offers next steps
- **Concise, not terse**: Respects user's time, but doesn't feel cold
- **Supportive, not sycophantic**: Encourages without empty praise

### Tone Examples

**Encouragement Without Fluff:**
- "You're making progress—3 tasks cleared this week."
- "This one's straightforward—should take 5 minutes."
- "Heads up: this task has been waiting a while. Tackle it or remove it?"

**Honest Uncertainty:**
- "Couldn't find your current provider - can you share your last insurance email?"
- "Found 3 dentists nearby, but couldn't verify your preferred one"
- "This task might need more context - what specifically are you looking for?"

**Proactive Suggestions:**
- "Looks like your policy expires in 2 weeks. Want me to research renewal options?"
- "This email has 3 action items. Should I create separate tasks?"
- "You mentioned this in Slack last week. Want me to pull the context?"

---

## Feedback Loops

The AI improves through user feedback. Every interaction is an opportunity to learn.

### Lightweight Feedback (Every Research Brief)
- 👍 / 👎 on the summary (one tap, always visible)
- "Was this helpful?" prompt after task completion
- Click tracking on action buttons (implicit feedback)

### Deeper Feedback (Optional)
- "What was missing?" → Quick tags: Wrong info, Too vague, Not relevant, Outdated
- "Mark as perfect" → Strong positive signal
- Free text feedback for edge cases

### How Feedback Improves the System
- Thumbs down on a source → Deprioritize that source type
- Repeated dismissals from a channel → Reduce detection sensitivity (Phase 3+)
- Thumbs up patterns → Learn user's preferred research depth
- "Not a task" signals → Improve detection model (Phase 3+)
- Action button clicks → Reinforce which action types are most useful

---

## Human-in-the-Loop Guardrails

Todone is explicitly **"research only"** for V1. Users take all actions. This builds trust incrementally.

### Action Spectrum

**Phase 1 (Current):**
- Research and present information
- Generate action buttons
- User clicks to execute (opens link, copies text, etc.)

**Future Consideration (V2+):**
- "Draft this email" → Opens compose with pre-filled content, USER hits send
- "Add to calendar" → Shows preview, USER confirms
- "Book appointment" → Fills form, USER reviews and submits

**Always require explicit user action** for anything that leaves the system.

**Why this matters:**
- Builds trust incrementally
- Avoids "AI went rogue" stories
- Users stay in control while still saving time
- Clear accountability (user always makes final decision)

---

## Security & Privacy

Todone handles sensitive data (policy numbers, account details, work communications). Trust is foundational.

### Data Handling Principles
- **Minimize collection**: Only pull what's needed for task detection/research
- **Encrypt everywhere**: At rest and in transit, industry standard
- **No training on user data**: Your data improves YOUR experience, not our models
- **User-controlled connections**: Disconnect anytime, data deleted

### Sensitive Data Handling
- Policy numbers, account numbers → encrypted, never logged in plain text
- Personal context (memory) → user-controlled encrypted storage
- Option for "ephemeral mode" → research happens, nothing stored

### Trust Signals
- Clear data flow explanation in onboarding
- "What we accessed" transparency log
- SOC2 compliance roadmap for enterprise (Phase 5+)
- Data residency options for regulated industries (Phase 5+)

### On-Device vs. Cloud
- **V1**: Cloud processing (necessary for research capability)
- **Future**: On-device detection for sensitive pattern matching, cloud for research
- **Enterprise**: Option for private cloud / data residency

---

## Data Models

The core data structures that power Todone. Designed to be simple for Phase 1 (localStorage) but extensible for future database migration.

### Core Entity: Task

The task is the central object. Everything else hangs off it.

```javascript
Task {
  id: string                    // Unique identifier (UUID)
  title: string                 // User-entered task text
  status: 'pending' | 'researching' | 'ready' | 'completed' | 'archived'
  order: number                 // For drag-and-drop sorting
  research: Research | null     // Populated after AI research completes
  chatHistory: ChatMessage[]    // Per-task conversation thread (Phase 2)
  feedback: Feedback | null     // User's thumbs up/down + comments
  source: Source | null         // Where task came from (Phase 3+)
  createdAt: timestamp
  updatedAt: timestamp
  completedAt: timestamp | null
}
```

### Research Object

The research object is structured JSON with a common schema plus task-type-specific fields. This enables the generated action UI while keeping things parseable.

```javascript
Research {
  // === Common fields (all tasks) ===
  summary: string               // CEO-briefing one-liner (displayed under task)
  taskType: string              // 'insurance' | 'appointment' | 'home_repair' | 'document_review' | 'engineering' | 'general'
  confidence: 'high' | 'medium' | 'low'
  keyActions: Action[]          // Primary actions user can take (dynamically generated)
  sources: SourceReference[]    // Where info came from (for verification)
  followUpQuestion: string|null // Proactive question to user
  rawMarkdown: string           // Full research as markdown (fallback display)
  researchedAt: timestamp

  // === Task-type-specific fields (nullable) ===
  structuredData: {
    // Insurance tasks
    policyNumber?: string
    expirationDate?: string
    currentProvider?: string
    comparisons?: Comparison[]

    // Appointment tasks
    contactName?: string
    phoneNumber?: string
    email?: string
    address?: string
    availableSlots?: TimeSlot[]

    // Home repair tasks
    diyOption?: DIYOption
    professionalOption?: ProfessionalOption
    estimatedCost?: CostRange

    // Document review tasks
    documentLink?: string
    keyChanges?: string[]
    deadline?: string
    draftReply?: string
  }
}
```

### Supporting Types

```javascript
Action {
  label: string                 // Button text: 'Get Quote', 'Call Now'
  type: 'link' | 'phone' | 'email' | 'copy' | 'draft'
  value: string                 // URL, phone number, email, or content to copy
  isPrimary: boolean            // Highlight as main action
}

SourceReference {
  title: string                 // 'Geico.com', 'Your email (Jan 15)'
  url: string | null            // Link to verify (if available)
  type: 'web' | 'email' | 'slack' | 'calendar' | 'document'
  confidence: 'high' | 'medium' | 'low'
  snippet: string | null        // Brief excerpt from source
}

ChatMessage {                   // Phase 2+
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: timestamp
}

Feedback {
  rating: 'up' | 'down' | null
  tags: string[]                // 'wrong_info', 'too_vague', 'not_relevant', 'perfect'
  comment: string | null
  submittedAt: timestamp
}

Comparison {                    // For insurance, services, etc.
  provider: string
  price: string | null
  rating: number | null
  pros: string[]
  cons: string[]
  actionUrl: string
}
```

### Phase 3+ Models (Auto-Population)

These models come into play when integrations are added:

```javascript
Source {                        // Where an auto-detected task came from
  integration: 'gmail' | 'slack' | 'linear' | 'calendar' | 'jira'
  channel: string | null        // Slack channel, email folder, etc.
  messageId: string             // Original message/ticket ID
  sender: string | null         // Who sent it
  timestamp: timestamp          // When original message was sent
  permalink: string | null      // Deep link to original
  snippet: string               // Brief excerpt that triggered detection
}

InboxItem {                     // Auto-detected task awaiting triage
  id: string
  suggestedTitle: string        // AI-generated task title
  source: Source
  confidence: number            // 0-1 score for detection confidence
  status: 'pending' | 'accepted' | 'dismissed' | 'snoozed'
  dismissReason: 'not_a_task' | 'already_done' | 'dismissed' | null
  snoozeUntil: timestamp | null
  detectedAt: timestamp
}
```

### localStorage Schema (Phase 1)

```javascript
// Key: todone:{userId}:tasks
// Value: Task[]

// Key: todone:{userId}:settings
// Value: { researchDepth: 'quick' | 'thorough', theme: 'light' | 'dark' }

// Key: todone:{userId}:memory (Phase 2)
// Value: { insuranceProvider: 'Geico', dentist: 'Dr. Chen', ... }
```

### Why This Structure?

- **Structured + Flexible**: Common fields for all tasks, plus task-type-specific data for generated UI
- **rawMarkdown fallback**: If structured parsing fails, we can always display the markdown
- **Actions are typed**: Enables proper button rendering (phone links, email links, copy buttons)
- **Sources are first-class**: Every piece of info can be verified
- **Chat is per-task**: Conversation context stays scoped to the relevant task (Phase 2+)

---

## Competitive Landscape

### Primary Competitor: Google Gemini Agent
Google's flagship agentic AI. Handles multi-step tasks, connects to Gmail, Calendar, Drive. Session-based, not list-based.

**Our advantages:**
- List-based persistence (not ephemeral sessions)
- Faster time-to-value (8 seconds vs minutes)
- Task-specific generated UI (not just chat)
- Designed for task execution, not general assistance

### Other Competitors

**Notion AI:**
- Deep workspace integration, but requires Notion investment
- Knowledge-focused, not task-centric
- No instant research on individual tasks

**Motion:**
- Excellent scheduling AI, but no task discovery or research
- Calendar-first, not task-first

**Linear/Jira/Asana:**
- Track explicit tickets, miss implicit tasks from Slack/email
- No research capability
- Designed for team tracking, not individual execution

**Superhuman/Shortwave:**
- Email-only, don't unify Slack, calendar, project tools
- AI features focused on email triage, not task execution

### Our Moat

**The "moat" is anticipation**, not features. We win by being the first to show context before the user asks.

---

## Founder Notes

- **The "moat" is anticipation**, not features. We win by being the first to show context before the user asks.
- **Resist feature creep**: Every feature should reduce friction, not add options.
- **Speed is a feature**: If research takes >8 seconds, users will context-switch. Optimize relentlessly.
- **Start with Gemini Search**: Validate the magic moment first, upgrade to specialized search (Tavily/Exa) only when users demand deeper research capabilities.
- **Privacy-first**: Personal context is our competitive advantage, but also our biggest trust hurdle. Be transparent.
- **Dynamic > Static**: Action buttons must adapt to every task type. Predefined templates would kill the magic.
- **Silence is OK**: Not every task needs AI research. Save costs and set expectations by gracefully skipping ambiguous tasks.

---

## All Questions Resolved ✓

1. ~~How should the "Inbox" vs "Today" zones work?~~  
   **Answer**: Inbox is primary, Today is optional filtered view

2. ~~Should research happen on task creation or on first view?~~  
   **Answer**: Immediate on creation, 8-second reveal

3. ~~What's the fallback if Gemini search fails or is slow?~~  
   **Answer**: Show task without briefing, retry in background

4. ~~Which search API for Phase 1 research?~~  
   **Answer**: Start with Gemini Google Search, consider Tavily/Exa for Phase 2+

5. ~~How to handle ambiguous tasks like "Call mom"?~~  
   **Answer**: Skip research, show 💭 icon, task still saves normally. Silence = success.

6. ~~Should action buttons be generated dynamically per task type, or use predefined templates?~~  
   **Answer**: Always dynamic. Gemini function calling determines 1-3 contextual actions per task. No templates.

---

## Immediate Next Steps

1. Finalize Phase 1 UI wireframes
2. Define Gemini prompt structure for dynamic action generation
3. Build core task input + research flow
4. Implement progressive reveal animation (0-8 seconds)
5. Test magic moment with 5-10 users
6. Iterate based on feedback

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Research too slow (>8 seconds) | Use Gemini Flash, cache results, optimize prompt |
| Research quality poor | Start with 5 task types, iterate based on feedback |
| Users don't trust AI info | Source verification on every fact, report incorrect button |
| API costs too high | Skip personal tasks, cache results, rate limits |
| Users prefer traditional lists | A/B test with research on/off toggle |

---

**Version**: 4.1  
**Last Updated**: January 2025  
**Status**: Ready for Claude Code implementation

---

*Todone: Find it. Research it. Done.*
