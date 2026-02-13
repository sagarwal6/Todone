# Insight Scan Feature - Current State

## Overview

The Insight Scan feature scans Gmail (30 days) and Calendar (14 days) to surface actionable items the AI can help with.

**Current Architecture:**
1. **Metadata Sweep** (~3-5s) - Fetch email/calendar metadata with smart filtering
2. **AI Analysis** (~10-20s) - Claude analyzes metadata, returns greeting + quickWin + bundled actions
3. **Render Results** (instant) - Display in inbox-style flat list grouped by type
4. **Action Execution** (per action) - Execute via task creation flow

---

## Completed Features

### Core Infrastructure
- [x] `/lib/scan/types.ts` - ScanContext, InsightAction, ActionBundle, etc.
- [x] `/lib/scan/metadata.ts` - Email/calendar metadata processing
- [x] `/lib/scan/prompts.ts` - Claude prompts for bundled analysis
- [x] `/app/api/scan/route.ts` - Single SSE endpoint for scan + analysis
- [x] `/app/api/scan/actions/[actionId]/execute/route.ts` - Action execution API
- [x] `/app/api/scan/email/[messageId]/route.ts` - Email content fetch API (NEW)
- [x] `/hooks/useInsightScan.ts` - React hook for scan orchestration
- [x] Supabase tables: `insight_scans`, `insight_actions`

### Email Processing
- [x] `/lib/email/scoring.ts` - Pre-LLM email priority scoring
- [x] `/lib/email/types.ts` - Email scoring types
- [x] Gmail API pagination for up to 300 emails
- [x] Smart filtering: `in:inbox`, excludes promotions/social
- [x] Recency boost: +10 today, +5 yesterday, +2 last 3 days
- [x] **No personal domain bias** - work emails from clients/colleagues equally important

### Meeting Prep Tracking
- [x] Already-prepped meetings tracked by `eventId` in `insight_actions` table
- [x] Prepped meetings show "View prep" instead of "Prep" button
- [x] Meetings stay in chronological order regardless of prep status
- [x] Deep research for unfamiliar contacts: LinkedIn, news, X, recent posts

### Draft Email UX
- [x] User input prompt before drafting - user says what they want first
- [x] Input field in expanded mode: "What should I say?"
- [x] User instructions passed to Claude for drafting

### UI Components
- [x] `/components/insight/InsightView.tsx` - Main container (inbox-style)
- [x] `/components/insight/InsightItem.tsx` - Individual action row
- [x] Grouped by type: Meetings section, Emails section
- [x] Scan progress states, error handling, empty state
- [x] Styling matches Tasks view (font sizes, colors)

### Action Types (MVP)
- [x] `draft_response` - Reply to emails needing response (with user input)
- [x] `meeting_prep` - Prep for upcoming meetings (next 48 hours)
- [x] `follow_up` - Follow up on stale threads

---

## Recent Design Decisions

### Email Filtering Philosophy
- **Only show emails user needs to respond to** - removed "sent awaiting reply"
- **No personal domain bias** - work emails from clients/colleagues equally important
- **Recency matters** - today's emails boosted in priority
- **Archived = handled** - `in:inbox` filter excludes archived emails

### Email Scoring Signals
| Signal | Score |
|--------|-------|
| Direct recipient (≤3 recipients) | +12 |
| One-to-one conversation | +5 |
| Personal domain (gmail, outlook, etc.) | +5 |
| Existing thread | +3 |
| Long thread (3+ messages) | +2 |
| Gmail Primary category | +3 |
| CC'd | -3 |
| Mailing list | -6 |
| Automated sender | -4 |
| Platform domain (LinkedIn, etc.) | -4 |
| Gmail Updates category | -4 |
| Marketing subject | -4 |
| Gmail Promotions | -10 |

**Recency Boost (applied on top):**
- Today: +10
- Yesterday: +5
- Last 3 days: +2

**Tier Thresholds:**
- High: score ≥ 10
- Medium: score 3-9
- Low: score -2 to 2
- Skip: score < -2

### Meeting Prep for Unfamiliar Contacts
When user hasn't emailed much with a meeting attendee (<5 emails in history):
- LinkedIn profile research
- Recent news articles about them or their company
- X/Twitter profile
- Recent LinkedIn posts they authored
- Professional context and background

### Draft Email Flow
1. User clicks "Draft" on an email action
2. Input field appears: "What should I say?"
3. User types intent/direction
4. Claude drafts reply incorporating user instructions
5. Draft appears for review/edit

### Already-Prepped Meetings
- Track by `eventId` in `execution_context` of completed `meeting_prep` actions
- Show "View prep" button instead of "Prep"
- Clicking "View prep" should open the task inline or navigate to it
- Meetings stay in chronological order (soonest first)

---

## File Structure

```
/lib/scan/
├── types.ts          # Type definitions (ActionBundle, MeetingPrepContext, etc.)
├── metadata.ts       # Email/calendar metadata processing
└── prompts.ts        # Claude prompts (draft, meeting prep with deep research)

/lib/email/
├── types.ts          # Email scoring types
└── scoring.ts        # Pre-LLM priority scoring (no personal domain bias)

/app/api/scan/
├── route.ts                          # SSE endpoint for scan
├── email/[messageId]/route.ts        # Email content fetch (NEW)
└── actions/[actionId]/execute/route.ts  # Action execution

/hooks/
└── useInsightScan.ts # React hook

/components/insight/
├── InsightView.tsx       # Main container (with sub-view state for list vs prep)
├── InsightItem.tsx       # Action row (email preview + draft input)
├── PrepDetailView.tsx    # Inline prep detail view (replaces list, not a modal)
└── index.ts              # Exports
```

---

## Completed Recently

### Email Draft Flow (Improved)
- [x] Click "Draft" immediately expands to show email content + input field
- [x] Input field auto-focuses when email loads
- [x] No extra "Draft a reply" button - input is visible immediately
- [x] Email content fetched via `/api/scan/email/[messageId]` API

### View Prep Flow (PrepDetailView - Replace Pattern)
- [x] Created `PrepDetailView` component - inline view that replaces Heads up
- [x] User clicks "View prep" → Heads up list replaced with prep detail (no modal)
- [x] "← Heads up" back button navigates back to list
- [x] "Open full task" button to navigate to ConversationPanel
- [x] Follows same navigation pattern as clicking a task from task list
- [x] Mobile: Same behavior (no separate bottom sheet modal)

### Unified Meeting/Email Expansion (Feb 2026)
- [x] Both emails AND meetings now expand in-place when clicked (no immediate execution)
- [x] Meeting expansion shows: attendee chips with avatars, description, AI suggested focus
- [x] Consistent interaction pattern: Click → Expand → Review → Provide direction → Execute
- [x] "Prep now" button with `psychology` icon for meetings
- [x] Input field for prep direction: "Any specific topics to focus on?"

### Draft Mode Toggle (Feb 2026)
- [x] Toggle between "Draft for me" and "Write it myself" modes
- [x] Different helper text per mode
- [x] Different placeholder text and textarea height per mode
- [x] Auto-detection based on content patterns (greeting + sign-off = write mode)
- [x] Button changes: "Draft reply" vs "Save draft" with appropriate icons

### Add to Tasks Feature (Feb 2026)
- [x] "Graduates" Heads up items to task list without executing immediately
- [x] `playlist_add` icon button on hover (alongside dismiss)
- [x] API supports `addToTasksOnly` flag - marks action as completed with `graduatedToTask` result
- [x] Returns `sourceMetadata` for creating local task with full context
- [x] Added to: InsightItem, OfferItem, QuickWinCard, OfferBundle

### UI/UX Improvements (Feb 2026)
- [x] Removed sparkles (auto_awesome icons) from suggestion rows
- [x] Increased grey text contrast for WCAG AA compliance (gray-400/500 → gray-600)
- [x] Normalized font sizes: text-inbox-body (15px), text-inbox-caption (14px)
- [x] Action hints on hover with chevron indicator when not hovering
- [x] Expanded card: removed accent bar, added border, increased padding (px-6)
- [x] Email recipients (To/CC) shown in expanded view
- [x] Border consistency on expanded cards (border border-gray-200, my-2)

### Bug Fixes (Feb 2026)
- [x] Fixed "View prep" showing for unprepped meetings - query now filters by user_id
- [x] Fixed Garrick email not showing - allowed read medium-tier emails if isDirect
- [x] Removed `isExpertNetwork` signal from email scoring (not useful)
- [x] Added PERSONAL_DOMAIN bonus (+5) - emails from personal domains (gmail, outlook) now score higher to counteract GMAIL_UPDATES penalty for real people's emails

---

## Design Decisions (Feb 2026)

### Unified Expansion Pattern
**Decision:** Both emails and meetings expand in-place rather than meetings navigating away.
**Rationale:** Maintains "triage" mental model - user stays in Heads up context, can process multiple items efficiently. Matches how email expansion already worked.

### Draft vs Write Mode
**Decision:** Toggle between AI-assisted drafting and user writing directly.
**Rationale:** Users may want to type quick replies themselves without AI, or want full control. Auto-detection helps but manual toggle provides explicit control.

### Add to Tasks (Graduation)
**Decision:** Allow promoting Heads up items to task list without immediate execution.
**Rationale:** Not all items need immediate action. Some deserve deliberate ownership on the task list for later. Provides user agency over what gets committed to their todo list.

---

## TODO

### High Priority
- [ ] Mobile responsiveness testing for new expansion patterns

### Medium Priority
- [ ] Rate limiting for scans
- [ ] Audit logging for scans/actions
- [ ] Cache invalidation strategy
- [ ] Duplicate detection when adding to tasks (if task already exists)

### Low Priority
- [ ] User preference for scan frequency
- [ ] Custom filtering rules
- [ ] Gmail label creation (requires gmail.modify scope)
- [ ] Dismissal history / "Recently dismissed" view

---

## Testing Checklist

- [x] Scan fetches emails and calendar events
- [x] Email scoring filters out noise (newsletters, promotions)
- [x] Recency boost prioritizes today's emails
- [x] Archived emails excluded
- [x] Personal domains NOT boosted (work emails equal)
- [x] Meeting prep shows events in next 48 hours
- [x] Already-prepped meetings show "View prep" button (filtered by user_id)
- [x] Meetings stay in chronological order
- [x] UI renders grouped actions
- [x] Draft input prompt appears before drafting
- [x] User input passed to Claude
- [x] Execute action creates task
- [x] View prep replaces Heads up with inline prep detail view
- [x] Email preview expands with input field visible
- [x] PrepDetailView has "← Heads up" back button and "Open full task"
- [x] Meetings expand in-place (same as emails)
- [x] Meeting expansion shows attendees, description, suggested focus
- [x] Draft mode toggle works ("Draft for me" vs "Write it myself")
- [x] "Add to Tasks" button appears on hover
- [x] "Add to Tasks" creates task without executing
- [x] Email recipients (To/CC) shown in expanded view
- [x] Action hints appear on hover, chevron when not hovering
- [x] Calendar-aware drafts: Agent checks calendar when replying to scheduling emails
- [ ] Mobile bottom sheet experience
- [ ] Error recovery from API failures
- [ ] Mobile responsiveness for expanded cards

---

## Calendar-Aware Draft Replies (February 10, 2026)

**Feature:** When drafting a reply to an email about scheduling, the agent now checks the user's calendar.

**How it works:**
1. Agent detects if email is about scheduling (meeting up, coffee, calls, availability)
2. Uses `calendar_list` to fetch events for the next 7 days
3. Shows the user a summary of their calendar so they can verify availability
4. Identifies free time slots (gaps between events)
5. Suggests 2-3 specific available times in the draft

**Calendar context shown to user:**
```
I checked your calendar for the next week:
- Monday: Team standup 9-10am, Lunch with Sarah 12-1pm
- Tuesday: Free until 3pm, then Design review 3-4pm
- Wednesday: All-day offsite
- Thursday: Morning free, 1:1 with manager 2-3pm

Based on your availability, I'm suggesting Tuesday morning or Thursday morning.
```

**Before:** "Sure, how about Friday morning some time?"
**After:** Shows calendar context + "Sure, how about Tuesday at 2pm or Thursday morning?"

---

## Read-Only API Migration (February 10, 2026)

**Important:** The app now uses read-only OAuth scopes only.

- `gmail.readonly` instead of `gmail.send` + `gmail.compose`
- `calendar.readonly` instead of `calendar` + `calendar.events`

**Impact on Draft Flow:**
- Drafts are now prepared by AI but opened in Gmail via compose URL
- User clicks "Open in Gmail" → Gmail opens with pre-filled content → User sends manually
- Same for calendar: "Open in Calendar" → Google Calendar opens → User creates manually

See `sessions/2-7-agentic-connectors/plan.md` for full details on this migration.
