# TODONE
## Product Brief v5.0
*The AI planner that does the thinking*

---

## Executive Summary

Todone is an AI-powered task management system that transforms how people execute on their to-do lists. Unlike traditional task managers that simply track what needs to be done, Todone:

1. **Surfaces action items automatically** from your Gmail and Calendar (read-only)
2. **Researches each task instantly** and provides a CEO-style briefing with context, next steps, and actionable links
3. **Creates outputs** (documents, comparisons, drafts) and saves them to a shared Drive folder

**The Core Insight**: People don't need help remembering their tasks. They need help *finding* them and *executing* them. The real friction isn't capturing "switch car insurance"—it's (a) remembering you need to do it, and (b) spending 30 minutes researching providers, finding your policy number, and comparing options.

Todone eliminates both friction points by proactively surfacing tasks and doing the research instantly.

---

## The Problem

### For Individuals
Most to-do apps fail at two critical moments:

1. **Discovery**: Action items are buried in emails, calendar invites, and mental notes. You forget half of what you need to do.
2. **Execution**: Even when you capture a task, the real work—researching, comparing, drafting—remains undone.

When you add "switch car insurance" to your list, it just sits there while the real work of researching providers, finding your policy number, and understanding your options remains undone. And you probably forgot about the three other things in your inbox that also need action.

### For Teams (Future)
Knowledge workers are drowning in fragmented action items across tools:
- "Can you look into this?" buried in a Slack thread
- Action items from meeting notes that never get captured
- Jira tickets assigned but context scattered across 5 different channels
- Email requests that get lost in the inbox
- Calendar invites with prep work that never happens

---

## The Solution: Todone

Todone is an AI-native task management system with three superpowers:

1. **Proactive Task Surfacing** — Connects to Gmail and Calendar (read-only) to automatically detect and suggest action items
2. **Instant Research** — Every task gets a CEO-style briefing with context, next steps, and sources within 8 seconds
3. **Output Generation** — Creates documents, comparisons, and drafts, saved to a shared Drive folder you can access anywhere

---

## The Magic Moment

The first 8 seconds after a user adds a task define whether they trust Todone.

### Example Flow
```
User types: "Book dentist appointment"

[0-8 seconds later]

✨ Card expands to reveal:
─────────────────────────────────────
📋 CEO Briefing
Your dentist: Dr. Sarah Chen, Smile Dental
Last visit: 6 months ago (cleaning due)
Available slots: Tomorrow 2pm, Friday 10am
Insurance: Covered under Delta Dental

[Book Now] [Add to Calendar] [Remind Me Later]
─────────────────────────────────────
```

### Proactive Surfacing Example
```
[User opens Todone in the morning]

🔔 Suggested from your inbox:
─────────────────────────────────────
📧 "Reply to landlord about lease renewal"
   From: landlord@building.com (2 days ago)
   Detected: Request for decision by Friday
   
   [Add to List] [Dismiss] [Already Done]
─────────────────────────────────────

📅 "Prep for 1:1 with manager"
   Meeting: Tomorrow 2:00 PM
   Detected: No agenda set, recurring meeting
   
   [Add to List] [Dismiss] [Already Done]
─────────────────────────────────────
```

### Design Elements That Create Magic
- **Progressive reveal** (not just a loading spinner)
- **Confidence indicators** (shows it's "thinking" not "stuck")
- **Proactive suggestions** from Gmail/Calendar before you even add tasks
- **Generated action UI** unique to each task type
- **Source verification** (every fact cites its source)
- **Document outputs** saved to your Todone Drive folder

---

## Key Differentiator

Traditional to-dos are **write-only**. You manually capture tasks, then still have to context-switch to execute them.

Todone is **read-write-create**:
- **Read**: Automatically surfaces tasks from your email and calendar
- **Write**: You add your own tasks with zero friction
- **Create**: AI generates documents, comparisons, and drafts you can actually use

---

## Gmail & Calendar Integration (Read-Only)

### Why Read-Only?
- **Lower permission friction**: Users more comfortable granting read access than full access
- **Trust-first approach**: We see your inbox, we never touch it
- **Focused scope**: We only need to detect action items, not send emails

### What We Detect

**From Gmail:**
| Signal | Example | Task Surfaced |
|--------|---------|---------------|
| Explicit request | "Can you send me the report by Friday?" | "Send report to [sender]" |
| Question requiring response | "What do you think about the proposal?" | "Reply to [sender] re: proposal" |
| Deadline mentioned | "Please confirm by EOD Tuesday" | "Confirm [topic] - Due Tuesday" |
| Follow-up needed | "Let me know if you have questions" | "Follow up on [topic]" |
| Unread from important sender | Boss, direct reports, key contacts | "Review email from [sender]" |
| Calendar/scheduling | "Are you free Thursday?" | "Respond to meeting request" |

**From Calendar:**
| Signal | Example | Task Surfaced |
|--------|---------|---------------|
| Meeting with no agenda | 1:1 with no description | "Prep agenda for [meeting]" |
| External meeting | Meeting with outside domain | "Research [attendee/company]" |
| Upcoming deadline | Event titled "Project X Due" | "Complete Project X" |
| Prep time blocked | "Prep for board meeting" | "Board meeting prep tasks" |
| Recurring with no recent notes | Weekly team sync | "Prep updates for [meeting]" |

### User Control

Users always control what becomes a task:
- **Inbox Zone**: Suggestions appear here first, never auto-added to list
- **Quick actions**: [Add to List] [Dismiss] [Not a Task] [Already Done] [Snooze]
- **Sensitivity settings**: Adjust detection aggressiveness per source
- **Exclude senders/calendars**: "Never suggest tasks from this newsletter"
- **Batch actions**: "Add all" / "Dismiss all from this sender"

### Privacy & Trust
- Read-only OAuth scopes only
- We never send emails or modify calendar events
- Clear explanation: "Todone reads your inbox to find action items. We never send emails on your behalf."
- Data retention: Email content not stored, only extracted task signals
- User can disconnect anytime, data deleted within 24 hours

---

## File Output Strategy

### The Problem with Outputs
When Todone generates something useful—a comparison table, a draft email, a research summary—where does it go? 
- If it disappears when the session ends, users lose value
- If we ask users to give us access to their entire Drive, that's scary
- If we host files ourselves outside Drive, it doesn't feel integrated

### The Solution: Todone-Managed Drive Folder

Todone creates and owns a Google Drive folder, then shares it with the user. The user never gives Todone access to their Drive—Todone just shares its own folder with them.

**How it works:**
1. Todone has its own Google Workspace account (`workspace@todone.app`)
2. When a user signs up, Todone creates a folder for them
3. Todone shares that folder with the user's email (view or edit access)
4. The folder appears in the user's "Shared with me" → they can add it to "My Drive"
5. All Todone outputs are saved to this folder
6. User can move, copy, or share files however they want

**User experience:**
- "Add your Todone folder to your Drive" (one-click)
- Files just appear when Todone creates them
- Feels native to their workflow
- No scary "Give Todone access to your entire Drive" prompt

**Folder structure:**
```
Todone Outputs (shared with user@gmail.com)
├── Research/
│   ├── Car Insurance Comparison.gsheet
│   ├── Plumber Options - Jan 2026.gdoc
│   └── Dentist Research.gdoc
├── Drafts/
│   ├── Email to Landlord - Lease Renewal.gdoc
│   └── Cover Letter - Acme Corp.gdoc
└── Reports/
    └── Weekly Task Summary - Jan 27.gdoc
```

**For Teams (Future):**
```
Todone Team Outputs (shared with team@company.com)
├── Shared Research/
├── Meeting Prep/
└── Project Docs/
```

### Phased Rollout

**Phase 1**: No file outputs. Research appears in-app only. Validate core value prop.

**Phase 2**: "Save to Drive" button per output. Creates file in Todone's shared folder on demand.

**Phase 3**: Auto-save for substantial outputs. Research summaries, comparisons, and drafts automatically saved.

**Phase 4 (Teams)**: Shared team folder. All team members see outputs. Virality unlocked.

### Cost Considerations
- Google Workspace Business Starter: ~$7/user/month (but Todone only needs one account)
- Business Starter: 30GB pooled storage
- Business Standard: 2TB pooled storage
- At scale: Consider Google Cloud Storage + Drive API for cost optimization

---

## Generated Action UI

A key differentiator: Todone generates a custom UI for each task's next steps. This isn't just text—it's an interactive interface tailored to the task type.

### Examples by Task Type

**Insurance Task**: "Switch car insurance"
```
┌─────────────────────────────────────┐
│ 📊 Top 3 Providers Compared         │
│                                     │
│ Geico     $89/mo  ⭐4.2  [Get Quote]│
│ Progressive $95/mo ⭐4.0  [Get Quote]│
│ State Farm $102/mo ⭐4.4  [Get Quote]│
│                                     │
│ Your current: Allstate @ $120/mo    │
│ Potential savings: $31-37/mo        │
│                                     │
│ [Save Comparison to Drive]          │
└─────────────────────────────────────┘
```

**Home Repair Task**: "Fix leaky faucet"
```
┌─────────────────────────────────────┐
│ 🔧 Two paths forward:               │
│                                     │
│ DIY Route (~$15, 30 min)            │
│ • Likely cause: worn washer         │
│ • Video tutorial: [Watch 5min]      │
│ • Parts needed: [Amazon $8]         │
│                                     │
│ Pro Route (~$150-200)               │
│ • Top rated: Mike's Plumbing ⭐4.8  │
│ • Available: Tomorrow 2-4pm         │
│ • [Request Quote] [Call Now]        │
│                                     │
│ 💡 "Want me to check your email for │
│    home warranty info?"  [Yes] [No] │
└─────────────────────────────────────┘
```

**Meeting Prep Task**: "Prep for 1:1 with Sarah"
```
┌─────────────────────────────────────┐
│ 📅 Meeting: Tomorrow 2:00 PM        │
│                                     │
│ Recent context:                     │
│ • Last 1:1: Discussed Q1 goals      │
│ • Open thread: Budget approval      │
│ • Her recent wins: Shipped feature X│
│                                     │
│ Suggested topics:                   │
│ □ Follow up on budget decision      │
│ □ Recognize feature X launch        │
│ □ Discuss Q2 planning               │
│                                     │
│ [Create Agenda Doc] [Add to Calendar]│
└─────────────────────────────────────┘
```

---

## Error Handling & Uncertainty

### Hallucination Strategy

AI research can fail or be incomplete. Here's how Todone handles uncertainty:

**Confidence Levels:**
| Level | Display | Example |
|-------|---------|---------|
| High | Facts stated directly | "Your dentist is Dr. Chen at Smile Dental" |
| Medium | Qualified statement | "Based on your location, these are likely options..." |
| Low | Explicit uncertainty | "Couldn't find your current provider. Can you share your last insurance email?" |
| Failed | Graceful fallback | "I couldn't research this one. Here's what I'd search for: [suggested queries]" |

**Principles:**
- Never state uncertain facts with confidence
- Always cite sources for verifiable claims
- Ask for clarification rather than guess
- "I couldn't find this" > "Here's my best guess"
- Offer to retry with more context

**UI Treatment:**
- High confidence: Clean briefing, no caveats
- Medium confidence: Subtle "ℹ️" indicator, expandable explanation
- Low confidence: Yellow highlight, explicit "Couldn't verify" label
- Failed: Gray card, "Research unavailable" with manual retry option

### When Research Isn't Needed

Some tasks don't benefit from AI research. Todone skips research (saves API costs) when:
- Task is purely personal: "Call mom", "Take vitamins"
- Task is ambiguous without context: "Do the thing"
- Task is a simple reminder: "Pick up dry cleaning"

**UI for skipped research:**
- 💭 icon instead of research card
- Task still saves and functions normally
- User can manually trigger research if wanted

---

## Feedback Loops

### Learning from User Behavior

Todone improves through implicit and explicit signals:

**Implicit Signals:**
| Action | What We Learn |
|--------|---------------|
| User clicks action button | Research was useful, action was relevant |
| User dismisses suggested task | Detection was wrong or already handled |
| User edits research summary | Our summary missed something |
| User ignores suggestion repeatedly | Source or sender should be deprioritized |
| User always adds from certain sender | Increase priority for that sender |
| Time from task creation to completion | Research quality correlates with speed |

**Explicit Signals:**
| Action | What We Learn |
|--------|---------------|
| 👍 on research | Quality was good |
| 👎 on research | Quality was poor (prompt for reason) |
| "Not a task" on suggestion | Detection was wrong |
| "Report incorrect" on fact | Source was unreliable |
| User edits generated action | Action type/wording needs improvement |

**How Feedback Improves Todone:**
1. **Personal model**: Your Todone learns your preferences, trusted sources, common task types
2. **Global model**: Aggregated (anonymized) feedback improves detection and research for everyone
3. **Source reliability**: Track which sources produce accurate vs. inaccurate info
4. **Task type patterns**: Learn what actions are most useful per task category

---

## Phased Roadmap

### Phase 1: Instant Research (Weeks 1-2)

**Goal**: Prove the magic moment. Users say "wow" at research quality.

**Features:**
- Manual task input (text field)
- Instant research on task creation
- CEO-briefing summary with progressive reveal
- Dynamically generated action UI per task type
- Source links with verification
- Basic persistence (localStorage)
- 👍/👎 feedback on research quality

**Not in Phase 1:**
- No Gmail/Calendar integration
- No file outputs
- No per-task chat
- No mobile apps

**Success Criteria:**
- 95% of research briefs load in <8 seconds
- 80% of generated actions are clicked
- Users return 3+ times in first week

---

### Phase 2: Personal Memory + Chat (Weeks 3-4)

**Goal**: Deepen engagement through context and conversation.

**New Features:**
- User profile: Preferences, location, frequent contacts
- Context injection: "Book dentist" knows YOUR dentist
- Per-task chat thread (ask follow-up questions)
- Task history influences future research
- OAuth scaffolding for Gmail/Calendar (prep for Phase 3)

**Storage:**
- Migrate from localStorage to Supabase
- Hybrid: Postgres for tasks, pgvector for embeddings

**Success Criteria:**
- >30% of users use per-task chat
- Memory recall accuracy >80%
- Returning user rate increases

---

### Phase 3: Gmail & Calendar Integration (Weeks 5-8)

**Goal**: Prove proactive task surfacing. The app finds tasks FOR you.

**New Features:**
- Gmail read-only integration
- Calendar read-only integration
- Inbox zone for suggested tasks (triage flow)
- Detection tuning controls
- "Save to Drive" for outputs (Todone-managed folder)

**Success Criteria:**
- >50% of suggested tasks accepted
- <20% "Not a task" rate
- Users report finding tasks they would have missed

---

### Phase 3.5: Mobile Apps (Weeks 9-12)

**Goal**: Capture tasks anywhere. Surface suggestions on the go.

**Features:**
- iOS app (native SwiftUI)
- Android app (native Compose)
- Push notifications for high-priority suggestions
- Quick capture widget
- Material Design 3 / Google Workspace aesthetic

---

### Phase 4: Auto-Save & Richer Outputs (Weeks 13-16)

**Goal**: Todone creates artifacts you actually use.

**New Features:**
- Auto-save substantial outputs to Drive folder
- Research reports as Google Docs
- Comparison tables as Google Sheets
- Draft emails as Google Docs
- Weekly summary reports

**Success Criteria:**
- >40% of users access their Todone Drive folder
- Files are opened/edited after creation
- Users share Todone-created files with others

---

### Phase 5: Teams & Virality (Future)

**Goal**: Shared folders create viral moments.

**Features:**
- Team workspaces
- Shared Todone folder visible to whole team
- "Look what Todone made" moments
- Slack integration for task surfacing
- Admin controls for enterprise

---

## Technical Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend (Web) | Next.js + React | Material Design 3 styling |
| Frontend (iOS) | SwiftUI | Google Workspace aesthetic |
| Frontend (Android) | Jetpack Compose | Material Design 3 native |
| Auth | Clerk | Social logins, 10K free MAU |
| Database | Supabase Postgres | Tasks, users, settings |
| Vector DB | Supabase pgvector | Embeddings for memory |
| AI | Gemini 2.0 Flash | Research with Google Search |
| File Storage | Google Drive API | Todone-managed Workspace |
| Deployment | Vercel | Web app hosting |

---

## Success Metrics

### Engagement
- DAU/WAU ratio
- Tasks created per user per week
- Suggested task acceptance rate
- Chat usage rate
- Drive folder access rate

### Value
- **Speed**: 95% of research briefs load in <8 seconds
- **Accuracy**: 80% of generated actions are clicked
- **Discovery**: Users report finding tasks they would have missed
- **Output usage**: Files created are opened/edited/shared

### Growth
- Retention: Users return 3+ times in first week
- Integrations connected per user
- File shares (future virality metric)
- Free → Pro conversion rate

### Efficiency
- API cost per task researched
- Research skip rate (cost savings)
- False positive rate on task detection

---

## Competitive Landscape

| Product | Strengths | Weakness vs. Todone |
|---------|-----------|---------------------|
| Google Tasks | Native Workspace integration | No research, no intelligence |
| Todoist | Great UX, cross-platform | No AI, no proactive surfacing |
| Things 3 | Beautiful design | Apple only, no AI |
| Motion | AI scheduling | Focused on calendar, not research |
| Notion | Flexible, powerful | Complex, not task-focused |
| Superhuman | Email triage | Email only, expensive |
| Reclaim.ai | Smart scheduling | Calendar-centric, no research |

**Todone's unique position**: We're the only app that both *finds* your tasks AND *researches* them for you, with outputs saved to your actual workflow (Drive).

---

## Founder Notes

- **The moat is anticipation**, not features. We win by surfacing context before the user asks.
- **Resist feature creep**: Every feature should reduce friction, not add options.
- **Speed is sacred**: If research takes >8 seconds, users context-switch. Optimize relentlessly.
- **Read-only first**: Gmail/Calendar read access builds trust. Write access can come later (maybe never).
- **Files make it real**: Research that creates a Drive doc feels more valuable than research that disappears.
- **Silence is OK**: Not every task needs research. Skipping gracefully saves costs and sets expectations.
- **Privacy is positioning**: "We read your inbox to help you, but we never touch it" is a feature.

---

## Open Questions

1. **Pricing model**: Free tier limits? What triggers upgrade to Pro?
2. **Notification strategy**: How aggressive on push notifications for suggested tasks?
3. **Offline behavior**: How much works without connection?
4. **Calendar write access**: Ever allow Todone to create events? Or stay read-only forever?
5. **Slack integration**: Phase 5 or sooner? High demand but adds complexity.

---

**Version**: 5.0
**Last Updated**: January 2026
**Status**: Ready for implementation

---

*Todone: Find it. Research it. Done.*
