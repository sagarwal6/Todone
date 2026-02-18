# Agent Improvements: Core Fixes & Token Optimization

## Status

All code phases complete (1, 1b, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16). Phase 8 (end-to-end testing) in progress.
Phase 16 (insight panel refactor) complete — meetings use ConversationPanel, emails keep InsightDetailPanel, stale actions time out.
Phase 15 (gmail_triage compound tool) complete — server-side search+score+preview in one call, saves 2-3 agent iterations per triage task.
Phase 15 also included scoring fixes: self-sent emails deprioritized (-20), mailing lists no longer get DIRECT_RECIPIENT bonus, "morning/evening brief" pattern added to marketing detection.

## Lessons Learned

1. **Prescriptive prompts don't scale.** Phase 1 added 20 rules for 12 test failures. Rules contradicted each other, everything was "CRITICAL", and long-tail tasks had no rules. Phase 1b replaced them with 6 principles — the model reasons better from principles than rulebooks.

2. **Principles need a stopping condition.** "Use tools liberally" is vague. "Keep working until you'd bet money on your answer" gives the model a clear bar. Equally important: "if you can't find it after exhausting tools, say so — never fabricate."

3. **Contact intelligence > contact lookup.** `contacts_search` returns name/phone/email but no relationship context. `contacts_analyze` scans 1 year of email + calendar and returns frequency, recency, direction, meeting patterns. This is how the agent knows which "Andrew" you mean.

4. **Tool descriptions are the real prompt.** The model chooses tools based on descriptions. Putting behavioral guidance in tool descriptions (search strategy, disambiguation logic, when NOT to use a tool) is more effective than system prompt rules.

5. **Don't add tools — use existing ones better.** The agent had all the data sources it needed. The gap was persistence: doing one search and presenting mediocre results vs. re-searching, cross-referencing, and filling gaps until confident.

6. **Compounding defaults create invisible ceilings.** Calendar pattern detection failed because 5 independent defaults compounded: max_results=20, 50-event API cap, 7-day default range, 30-day pattern threshold, and return slice masking fetched data. Each was reasonable alone; together they guaranteed failure. Fix: audit the full data pipeline from API call to agent response.

7. **Put important data first in tool results.** The 8000-char tool result truncation silently dropped `recurringMeetings` because it was placed after raw events in the JSON. Solution: structure responses so the most valuable data comes first.

8. **Server-side processing > agent reasoning for bulk data.** The agent can't reliably analyze 500+ calendar events to detect recurring patterns. Server-side pattern detection with scoring (frequency + recency + active + consistency) produces consistent results. Let the server crunch data; let the agent interpret and present.

9. **Timezone bugs hide in `getDay()`.** `new Date().getDay()` uses the server's timezone (UTC on Vercel). Sunday 7:15pm PT = Monday 3:15am UTC → wrong day. Fix: parse timezone offset from ISO strings and compute local day mathematically. This is deployment-agnostic.

## Context

Testing revealed 12 issues with the agent across 7 test tasks. The agent does good research but produces cluttered, verbose output, picks wrong communication methods, has too-narrow search scopes, and doesn't make results actionable (tappable links, scannable lists). Most fixes are system prompt changes (cheap, cached). Two require code changes (Markdown auto-linking, Gmail URLs).

## Issues Found in Testing

| # | Issue | Tests | Fix Type |
|---|-------|-------|----------|
| 1 | Phone/URL not tappable in body text | 2, 4 | Code (Markdown) |
| 2 | Defaults to email for casual "message X" | 1 | Prompt |
| 3 | Calendar range too narrow (7 days) | 4, workout | Prompt + tool desc |
| 4 | Too verbose / filler text | 1, 2, 4 | Prompt |
| 5 | No clickable email source links | 3, 5 | Code + prompt |
| 6 | Ambiguous names — picks one, ignores others | 4 (Andrew) | Prompt |
| 7 | Email triage = "today only", misses unanswered | 3 | Prompt |
| 8 | Email search too literal, no recency bias | 5 (Tim) | Prompt |
| 9 | All-day events treated as time blockers | 6 | Prompt |
| 10 | Over-researches simple tasks (4 tools for a text) | 1 | Prompt |
| 11 | Proposes without verifying assumptions first | Workout | Prompt |
| 12 | Should output scannable lists with links for triage | 3 | Prompt |

---

## Phase 1: System Prompt Overhaul (DONE)

**Commit:** `e54c262`

Added 20 sections / ~4000 tokens of prescriptive rules addressing issues #1-12. Worked for the specific test cases but created a new problem: rules contradict each other, everything is "CRITICAL", and long-tail tasks hit cases without rules. See Phase 1b.

### Phase 1 Testing
- [x] Test 1: "Message peter I'm running 10 min late" → agent picks Peter Yang (imminent meeting), not Peter Harbison. SMS link. Compose flow correct.
- [x] Test 2: "Call clipper about the overcharge" → phone tappable, hours included
- [~] Test 3: "What emails need my attention today?" → **Improved in Phase 12:** now fetches 30 results + 21 days of unread, filters to HIGH only, Gmail links present. Still tuning scoring (brand senders like Venmo scoring too high).
- [x] Test 4: "Do I meet with Andrew regularly?" → ✓ Recurring meeting detection works. Scoring system filters noise. See Phase 13. (Note: Thursday night get-togethers not detected — title variations too diverse for current normalizer. Acceptable for now.)
- [x] Test 5: "Check my email from Tim about working together" → ✓ Fixed by adding recency-first search guidance to gmail_search tool description. Agent now searches `from:tim newer_than:2y` first instead of requiring exact topic keywords.
- [x] Test 6: "When am I free Thursday afternoon?" → ✓ Works correctly
- [x] Test 7: "Create a workout schedule" → ✓ Works correctly

---

## Phase 2: Auto-Link Phone Numbers & URLs (DONE)

**Commit:** `2e06435`

## Phase 3: Clickable Email Sources (DONE)

**Commit:** `52aff4f`

---

## Phase 1b: Prompt Restructure — Principles Over Prescriptions

**Why:** The Phase 1 prompt grew to ~4000 tokens / 20 sections by adding a specific rule for every test failure. Rules contradict each other, everything marked "CRITICAL" competes for attention, and the long tail of user requests hits cases we never wrote rules for. Sonnet 4 is smart enough to reason about most of these — we should trust the model and give it principles, not a rulebook.

**Goal:** Cut prompt from ~4000 tokens to ~1500 tokens. Improve long-tail quality by leaning on model reasoning. Move tool-specific logic into tool descriptions where it belongs.

### Architecture — 3 layers

| Layer | Where | What goes here |
|-------|-------|----------------|
| **Identity** | System prompt (~200 tokens) | Who you are, tone, safety constraints |
| **Principles** | System prompt (~300 tokens) | 5-7 guiding principles that cover the long tail |
| **Tool intelligence** | Tool descriptions in `tools.ts` | Each tool knows when/how to be used; model reasons from there |

### Draft principles
1. **Personal data first** — Calendar → Email → Web. Never guess when you can look it up.
2. **Match intent** — "message" = text, "call" = call, "email" = email draft. Read the task.
3. **Disambiguate before acting** — Multiple matches? Use context (calendar, email recency) to rank. If still unclear, show options and ask.
4. **Concise & scannable** — Facts first. One line per item. No filler, no preambles, no repeating yourself.
5. **Verify before proposing** — Show what you found, confirm, then build on it.
6. **Be proactive** — Act, don't describe what you could do.

### What moves to tool descriptions
The model picks tools based on their descriptions. Put the intelligence there:
- `gmail_search` — search strategy (recent first, translate intent to operators, triage = today + unanswered)
- `calendar_list` — ranges (patterns: 90 days, free slots: that day), all-day events are informational
- `contacts_search` — disambiguation strategy (check calendar + email recency if multiple matches)
- `gmail_draft` — only for formal/detailed/group comms, never for a quick "message"

### What stays in system prompt (short)
- Identity + tone (elite EA, concise, facts first)
- The 6 principles
- Output format (scannable lists, link format, quickinfo JSON)
- Safety (read-only, drafts only, redaction notice)
- Date/time/user context (dynamic)

### What gets deleted (model already knows)
- All BAD/GOOD example pairs — the model understands from principles
- 6x "CRITICAL" sections — principles replace these
- Redundant restatements across sections
- Edge cases the model can reason about (sms: vs tel:, all-day events, etc.)

### Steps
- [x] **1b-1. Rewrite system prompt** — 285 lines → 40 lines, ~4000 tokens → ~595 tokens
- [x] **1b-2. Enrich tool descriptions** — gmail_search, calendar_list, contacts_search, gmail_draft updated with behavioral guidance
- [x] **1b-3. Commit** — committed with Phase 6

Testing deferred to Phase 8 — test everything together after all code phases are done.

---

## Phase 4: Parallel Tool Execution (DONE)

**Commit:** `fe14fd7`

Read-only tools execute via `Promise.all`, write tools sequentially after. Results reassembled in original call order.

### Testing
- [ ] Multi-tool tasks noticeably faster
- [ ] Write tools still execute after read tools
- [ ] Error in one parallel tool doesn't block others

---

## Phase 5: Cost & Token Logging (DONE)

**Commit:** `2ed5e32`

`logCost()` writes JSONL to `logs/ai-costs.jsonl` (gitignored). Hooked into agent loop (with cache tracking), insight scan, and Gemini research. Pricing table for Sonnet 4, Haiku 3.5, Gemini Flash.

### Testing
- [ ] JSONL lines appear with reasonable numbers for each AI call type
- [ ] Cache read tokens are non-zero

---

## Phase 6: `contacts_analyze` Tool (DONE)

**Commit:** committed with Phase 1b

**What was built:**
- Created `/lib/email/scoring-utils.ts` — extracted `extractEmailAddress`, `parseEmailList`, `isAutomatedSender` to avoid circular deps
- Created `/lib/email/contacts-analysis.ts` — `analyzeContactRelationship()`: scans 1 year of email (from/to) + calendar, computes frequency/recency/direction/meeting patterns/relationship strength
- Tool definition with rich description telling model to use it FIRST for any people-related task
- Handler + 45s timeout in execute-tool.ts
- System prompt principle #2 updated: "Know the person" — use contacts_analyze before acting on people tasks
- Returns structured data: email counts, frequency/month, who initiates, recent subjects, meeting pattern detection (weekly/biweekly/monthly), relationship strength (high/medium/low/none), and one-line summary

### Testing
- [ ] "Message Andrew" with many matches → ranks by email activity
- [ ] "Do I meet with X regularly?" → shows meeting pattern from contact analysis
- [ ] Automated senders filtered, result under 8000 chars

---

## Phase 7: Haiku for Insight Scan (DONE)

**Commit:** `41fd104`

Switched scan analysis model from Sonnet 4 to Haiku 3.5. ~4x cost reduction. Revert if quality degrades.

---

## Phase 8: End-to-End Verification

- [ ] All test cases pass on mobile PWA
- [ ] Long-tail tasks work without specific prompt rules
- [ ] Cost logs for all AI call types
- [ ] Token usage comparison before/after prompt restructure


---

## Phase 9: Agent Loop Audit Against Anthropic Best Practices (DONE)

**Why:** The agentic loop is the core value prop. Need to verify our implementation follows Anthropic's recommended patterns for tool use, error recovery, context management, and multi-turn reliability.

- [x] Research Anthropic agent SDK / agent loop best practices (2025)
- [x] Compare current `anthropic.ts` implementation against recommendations
- [x] Identify gaps and fix

### Gaps Found & Fixed

1. **Tool definition caching** — Added `cache_control` breakpoint on last tool definition. Tools are static across iterations; not caching them wasted ~40% of input tokens per call.

2. **`max_tokens` truncation handling** — If Claude hit the token limit mid-response (stop_reason=`max_tokens`), the loop either treated it as "done" or tried to process incomplete tool JSON. Now detects truncation and continues the conversation so Claude can finish its response.

3. **`max_tokens` too low** — Was 1500 (early) / 2500 (later). Claude needs room for JSON tool_use blocks + reasoning. Increased to flat 4096.

4. **API retry with exponential backoff** — 429 (rate limit) and 529 (overloaded) now retry 3 times with 1s/2s/4s backoff instead of failing the entire agent loop immediately.

5. **Conversation caching** — Added cache breakpoint on last user message in multi-turn. Prior conversation turns are now cached across iterations, saving significant tokens in long agent loops.

### What Was Already Good
- Error handling: tool errors returned to model (not thrown) ✓
- Parallel tool execution: read-only via Promise.all ✓
- Token budget tracking ✓
- Cancellation support (abort signal + DB check) ✓
- Tool result truncation (8000 char limit) ✓
- Saga-style step persistence ✓
- System prompt caching ✓

---

## Phase 13: Calendar Pattern Detection & Recurring Meeting Analysis (DONE)

**Why:** "Do I meet with Andrew regularly?" and "figure out who I meet with regularly" both failed. The calendar data pipeline had 5 compounding issues that prevented the agent from seeing recurring patterns.

### Root Causes Fixed

1. **50-event API cap** (`calendar.ts`): `Math.min(maxResults, 50)` silently capped all requests. Fixed with pagination via `nextPageToken` (up to 2500 events).

2. **Name-only attendee matching** (`contacts-analysis.ts`): `ahogue@gmail.com` doesn't contain "andrew". Fixed by building `knownEmails` set from email history + contacts lookup, then matching calendar attendees by resolved email addresses.

3. **No server-side calendar search** (`calendar.ts`): Added `q` parameter support for Google Calendar API free-text search (matches title, description, location, attendee names). Used by `contacts_analyze` to efficiently find person-specific events without downloading entire calendar.

4. **Truncation dropped pattern data** (`execute-tool.ts`): 8000-char tool result limit cut off `recurringMeetings` (placed after raw events). Fixed by putting `recurringMeetings` FIRST and only returning 10 upcoming events for context.

5. **Agent passed insufficient parameters**: Default max_results=20 and 7-day range meant pattern detection never triggered. Fixed by raising defaults (100 events, ±7 days), lowering pattern threshold (14 days), and internally fetching 2500 events for analysis regardless of agent's request.

### New Features

**Recurring meeting scoring** (0-100):
- Frequency (0-40): 3x/week=40, weekly=30, biweekly=20, monthly=10
- Recency (0-25): ≤7d=25, ≤30d=20, ≤60d=10
- Active/future scheduled (0-20): has upcoming instances
- Consistency (0-15): low gap variance between occurrences
- Minimum score threshold: 30 (filters sporadic meetings)

**Title normalization** for grouping events with variations:
- Strips locations after "at"/"@" (e.g., "Dinner at Elena's" → "Dinner")
- Strips embedded dates, session numbers, week numbers
- Known limitation: very diverse title variations (e.g., Thursday night dinners with different restaurant names) may not group correctly

**Meeting type classification**: solo / 1:1 / group (N people) based on median attendee count.

**Variable cadence display**: "2-3x/week" instead of always "2x/week" (uses floor/ceil of actual frequency).

**Timezone-safe day-of-week**: Parses timezone offset from ISO strings instead of using `getDay()` (which returns UTC day on servers). Applied in both `execute-tool.ts` and `contacts-analysis.ts`.

### Files Modified
- `lib/google/calendar.ts` — pagination, `q` parameter
- `lib/ai/execute-tool.ts` — calendar handler overhaul, `detectRecurringMeetings`, scoring, `addDayOfWeek`, `normalizeEventTitle`
- `lib/ai/tools.ts` — calendar_list description (no prescriptive defaults, `q` param, `dayOfWeek` field, `recurringMeetings` mention)
- `lib/email/contacts-analysis.ts` — 1yr+1yr timeframe, `q` parameter, `knownEmails` matching, timezone-safe `getLocalDayOfWeek`
- `lib/scan/prompts.ts` — replaced hardcoded personal names with generic placeholders

### Key Decisions
- **Let agent decide parameters**: Tool descriptions don't prescribe defaults ("next 7 days"). Server-side processing is robust regardless of what agent passes.
- **Server-side pattern detection, not agent reasoning**: Agent can't reliably analyze 500+ events. Server detects patterns, scores them, and presents results. Agent interprets and presents to user.
- **1 year back + 1 year forward** for contacts_analyze (was 3 years back). Sufficient for relationship context.
- **Score threshold of 30** filters sporadic meetings (e.g., 7 meetings in a year = not "regular").

### Testing
- [x] "Do I meet with Andrew regularly?" — finds ~35 meetings, shows 3-week cadence
- [x] "Figure out who I meet with regularly" — shows scored list, Krishnan PT at top (2-3x/week), sporadic meetings filtered
- [x] No hardcoded personal data in code (audited)
- [x] Timezone: Sunday evening PT events show correct day (not Monday)
- [~] Thursday night get-togethers not detected (title variation too diverse) — acceptable for now

---

## Phase 10: Email Tone & Style Tool

**Why:** Email drafts sound generic/corporate. The agent should match the user's actual writing style — per recipient, per email type, or a general default.

**Approach:** Build a `tone_analyze` tool that:
1. Reads user's recent sent emails (general style, or filtered to a specific recipient)
2. Extracts: greeting style, sign-off, formality level, average length, punctuation habits, emoji usage
3. Returns a style profile the agent uses when drafting emails
4. Cache the profile per-user (general) and per-recipient (specific) to avoid re-analyzing

**Layers:** Per-recipient style > per-email-type style > general user style > sensible defaults

- [ ] Design tool interface and style profile schema
- [ ] Implement sent email analysis (read last 5-10 sent emails)
- [ ] Extract style features (greeting, sign-off, length, formality)
- [ ] Integrate with gmail_draft — agent calls tone_analyze before drafting
- [ ] Cache style profiles to avoid repeated analysis

---

## Phase 11: EmailDraftCard — Compose vs Reply Split + Agent Disambiguation (DONE)

**Why:** Two problems surfaced:
1. **Reply UX broken** — For replies to existing threads, "Reply in Gmail" just opened the thread with no reference to the draft we prepared. Gmail compose URLs can't deep-link into a reply with pre-filled content.
2. **Agent picked wrong contact** — "message peter i'm running 10 min late" matched Peter Harbison (phone in contacts, no recent activity) instead of Peter Yang (meeting in 28 minutes). Agent also fabricated an email address (`peter.yang@gmail.com`).

### Changes

**`components/EmailDraftCard.tsx`** — Split into two modes based on `threadId`:
- **New message** (no threadId): Shows To/CC/Subject/Body (editable) + "Compose in Gmail" → opens pre-filled compose URL. Unchanged behavior.
- **Reply** (has threadId): Shows original email (collapsible) + suggested reply body (editable) + subtle explanation ("Todone can read but not send emails...") + "Copy Reply" button (with checkmark confirmation) + "Open Thread in Gmail" button. No To/Subject fields (Gmail handles those in-thread).

**`lib/ai/anthropic.ts`** — System prompt principle updates:
- Principle 3: "Right person first, then right channel" — disambiguate the person using context clues (imminent meeting, recent email thread) before choosing SMS vs email. If contacts_analyze top result doesn't match contextual signal, do a second lookup.
- Principle 4: Cross-reference rule — if contacts and calendar return different people for the same first name, weigh recency and relevance. Don't default to a contact with zero recent activity.
- Principle 5: Never construct email addresses from names — only use verified addresses from contacts, email history, or calendar attendee data.

**`lib/ai/tools.ts`** — Tool description updates:
- `gmail_draft`: "to" field MUST use a verified email address — never guess/construct from a name.
- `contacts_analyze`: Cross-reference with calendar_list before assuming the top result is correct.

### Testing
- [x] "message peter i'm running 10 min late" (new compose, no threadId) → shows compose flow with To/Subject/Body + "Compose in Gmail"
- [x] Email reply task (has threadId) → shows copyable reply + "Copy Reply" + "Open Thread in Gmail" + explanation
- [x] Agent correctly identifies Peter Yang (imminent meeting) over Peter Harbison (no recent activity)
- [x] Agent uses verified email from calendar attendee data, doesn't fabricate addresses
- [x] Build passes

---

## Phase 12: Email Triage & Scoring Fixes (IN PROGRESS)

**Why:** Email triage ("what emails need my attention?") was broken: only fetched 10 emails from today, showed bulk/newsletters, missed older unanswered threads. Agent output didn't match insight scan quality.

### Changes

**`lib/ai/execute-tool.ts`** — Server-side triage broadening:
- Detects triage-like queries (broad inbox/unread searches without specific from:/to:/subject: filters)
- Automatically runs a parallel search for `is:unread newer_than:21d` and merges/deduplicates
- Forces `max_results: 30` for triage queries (agent can't accidentally use default 10)
- Only sends HIGH priority emails to agent (MEDIUM/LOW/skip filtered server-side)
- Scoring note tells agent to present as "CEO briefing" — actionable items only

**`lib/ai/tools.ts`** — gmail_search tool description:
- Scoring info front and center (results are pre-scored, bulk filtered)
- Gmail thread link template so agent builds clickable links
- "Search as many times as needed" principle (not prescriptive "MUST do two")
- Tells agent triage broadening happens automatically

**`lib/email/scoring-utils.ts`** — Brand sender detection:
- Generic heuristic: if email local part matches domain name AND display name is single word, it's a brand/automated sender (e.g., `venmo@venmo.com` with display name "Venmo")
- Avoids maintaining a domain blocklist (whack-a-mole)
- Safe for personal domains: `andrew@andrew.com` with display name "Andrew Lee" (2 words) → not flagged

**`components/ConversationPanel.tsx`** — UI bug fixes:
- Fixed "0" rendering bug: `task.agentSteps?.length` in `||` chain evaluated to `0` → React rendered it as text
- Added agent error display: errors were set in state but never shown to user (silent failures)
- Button text changes to "Try again" after error

### Testing
- [x] Triage query fetches 30+ emails (today + 21 days unread)
- [x] Only HIGH priority emails shown (no newsletters, bulk, transaction alerts)
- [x] Gmail thread links present and clickable
- [x] "0" no longer renders on screen
- [x] Agent errors now visible in UI
- [ ] Brand sender detection doesn't false-positive on personal domains
- [ ] Scoring aligns with insight scan results

---

---

## Phase 14: Meeting Prep — Deep Research & Agent Tool

**Status: Complete**

### Problem
Meeting prep existed in the insight scan pipeline (`meeting_prep` action type) but produced weak results. The prompt told the agent to search emails and do web research, but the agent didn't go deep enough — no structured person research, no company info, no actionable links. Also no dedicated tool, so "prep for my 2pm meeting" required the agent to figure it out from scratch.

### Solution
1. **New `meeting_prep` compound tool** — server-side orchestration that runs `contacts_analyze` + multiple web searches per attendee in parallel. More reliable than hoping the agent chains 8-10 tool calls correctly.
2. **Simplified scan prompt** — `getMeetingPrepPrompt()` now just tells the agent to call the tool.

### Key Design Decisions
- **Parallel execution per attendee** (Promise.all) — 3-person meeting doesn't take 3x as long
- **Adaptive depth**: familiar contacts (HIGH/MEDIUM strength) get communication context only; unfamiliar contacts (LOW/NONE) get deep web research (LinkedIn, Twitter, company news)
- **Company research** only for unfamiliar contacts with identifiable company domain
- **120s timeout** — compound tool needs more time than individual tools
- **8000 char limit** — truncates bios/company info to fit tool result cap

### Files Modified
| File | Change |
|------|--------|
| `lib/ai/tools.ts` | Added `meetingPrepTool` definition, added to `agenticTools` and `READ_ONLY_TOOLS` |
| `lib/ai/execute-tool.ts` | Added `executeMeetingPrep()` with per-attendee parallel research |
| `lib/scan/prompts.ts` | Simplified `getMeetingPrepPrompt()` to use the tool |
| `lib/ai/types.ts` | Added `meeting_prep: 120_000` timeout |

### Testing
- [ ] Insight scan: trigger scan with upcoming meeting with external attendees → meeting_prep card appears → click "Do this" → agent calls meeting_prep tool → returns structured brief
- [ ] Direct task: "Prep for my meeting with [name] tomorrow" → agent finds meeting on calendar → calls meeting_prep → presents research
- [ ] Familiar contact: shows communication history, skips deep web research
- [ ] Unfamiliar contact: shows LinkedIn, Twitter, company info, recent news
- [ ] Multiple attendees: researched in parallel, results under 8000 chars
- [ ] No meeting found: agent says so, doesn't fabricate

---

## Phase 15: `gmail_triage` Compound Tool — Server-Side Search + Read (DONE)

**Status: Complete**

### Problem
Cost analysis shows **cache writes are 60% of total spend** ($3.09 of $5.10). Each agent iteration adds ~1,855 tokens of cache writes at $3.75/M. The most common agent pattern is triage: `gmail_search` → `gmail_read` x2-3 → respond (3-5 iterations, ~$0.03-0.06/task). By consolidating search + read into a single server-side tool, we save 2-3 iterations and their cache writes.

### Solution
New `gmail_triage` compound tool that reuses existing `gmail.searchEmails()`, `scoreEmails()`, and `readRecentThreads()` — no new Google API calls, just orchestration.

**Current flow (3-5 iterations):**
1. Agent calls `gmail_search` (broad triage query)
2. Agent sees HIGH-priority email list, decides to read top 2-3
3. Agent calls `gmail_read` on thread 1
4. Agent calls `gmail_read` on thread 2 (maybe 3)
5. Agent synthesizes and responds

**New flow (1-2 iterations):**
1. Agent calls `gmail_triage` → gets scored emails + top thread previews in one call
2. Agent synthesizes and responds (or follows up on gaps)

**Estimated savings:** ~$0.02/triage task × ~40% of tasks = meaningful at scale.

### Tool Definition
```
gmail_triage: {
  name: 'gmail_triage',
  description: 'Triage inbox — search, score, and preview top emails in one call...',
  input_schema: {
    query: string (optional) - Gmail search query, defaults to 'in:inbox newer_than:3d'
    max_results: number (optional) - max emails to search, default 30
    preview_count: number (optional) - how many top threads to read in full, default 3
  }
}
```

### Implementation (`executeGmailTriage` in execute-tool.ts)

1. **Search phase** (parallel): Main query + `is:unread newer_than:21d` broadening, deduplicated by email ID
2. **Score phase**: `scoreEmails()` → filter to HIGH tier only
3. **Preview phase** (parallel): Top N HIGH-priority threads read via `readRecentThreads()` — reuses the same thread reading + extraction logic from meeting_prep (action items, attachments, links, PII redaction)
4. **Return** structured result: `highPriorityEmails` (all HIGH, metadata), `threadPreviews` (full content for top N), `tierSummary`, `totalSearched`, `gaps` (unpreviewed HIGH thread IDs)

### Key Design Decisions
- **Reuses `readRecentThreads()`** from meeting_prep — same action item detection, attachment extraction, link extraction, PII redaction
- **Doesn't replace `gmail_search`** — `gmail_triage` is for broad inbox queries; `gmail_search` remains for specific person/topic searches
- **Updated `gmail_search` description** to direct broad triage queries to `gmail_triage` instead
- **Truncation limit: 10,000 chars** — more than regular tools (8K) but less than meeting_prep (12K)
- **Default preview_count: 3** — covers most triage needs; agent can request more
- **Timeout: 30,000ms** — searches + 3 reads complete well within this
- **Tool placed before `meetingPrepTool` in array** — so `meetingPrepTool` stays last with its `cache_control` breakpoint

### Files Modified
| File | Change |
|------|--------|
| `lib/ai/tools.ts` | Added `gmailTriageTool` definition, added to `agenticTools` and `READ_ONLY_TOOLS`, updated `gmail_search` description to mention `gmail_triage` |
| `lib/ai/execute-tool.ts` | Added `executeGmailTriage()` — parallel search, scoring, parallel thread reads, gaps array |
| `lib/ai/anthropic.ts` | Added `gmail_triage` to truncation limit mapping (10K) |
| `lib/ai/types.ts` | Added `gmail_triage: 30_000` to `toolTimeouts` |

### Scoring Fixes (discovered during testing)

**Problem:** `gmail_triage` surfaced low-priority items (self-reminders, CNN newsletter) that `gmail_search` had hidden because the agent used to filter during the read step. With the compound tool, everything comes pre-read so scoring must be tighter.

**Fixes applied:**
1. **`SELF_SENT: -20`** — emails where `from == userEmail` get heavy penalty (self-reminders drop from ~29 to ~9)
2. **`DIRECT_RECIPIENT` suppressed for mailing lists** — `List-Unsubscribe` header means mass email, so `DIRECT_RECIPIENT(+12)` and `ONE_TO_ONE(+5)` don't apply. CNN newsletter drops from ~13 to ~-3 (SKIP).
3. **Marketing pattern: `(morning|evening|daily|weekly) brief`** — catches news brief newsletters.

**Additional files modified:**
| File | Change |
|------|--------|
| `lib/email/scoring.ts` | Added `SELF_SENT` modifier, suppressed DIRECT/ONE_TO_ONE for mailing lists, added brief pattern |
| `lib/email/types.ts` | Added `isSelfSent` to `EmailSignals` interface |

### Testing
- [x] "What needs my attention" → agent calls `gmail_triage` → gets previews in 1 call → responds in 1-2 iterations total
- [x] CNN newsletter filtered out (was showing as HIGH, now SKIP)
- [x] Self-reminder filtered out (was showing as HIGH, now LOW)
- [ ] "Email from Tim about the project" → agent should still use `gmail_search` (specific query, not triage)
- [ ] Verify cost: triage tasks should drop from 3-5 iterations to 1-2
- [ ] Verify thread previews include action items, attachments, links

---

## Phase 16: Insight Panel Refactor — Meetings Use ConversationPanel (DONE)

**Why:** Insight actions (meeting preps, email drafts) had a custom InsightDetailPanel UI that duplicated functionality already in ConversationPanel (agent progress, QuickReferenceCard, chat). Meeting prep results should show the same rich UI as regular tasks.

### Architecture Change

**Meetings:** Click insight item → create hidden task (`source: 'insight'`) → ConversationPanel (same UI as regular tasks: agent progress, results, QuickReferenceCard, chat). Agent auto-starts immediately.

**Emails:** Click insight item → InsightDetailPanel (shows email body, "Draft for me" / "Write it myself" toggle, reply textarea). Task + agent only created when user initiates a draft. This preserves user control — can't predict whether they want to draft, write, or just read.

### Key Decisions

1. **Split by action type, not unified panel.** Original plan was to use ConversationPanel for everything. But emails need specific UI (email body display, draft/write mode toggle, reply textarea) that ConversationPanel doesn't have. Meetings work great in ConversationPanel; emails need InsightDetailPanel.

2. **Don't call `scan.executeAction` for emails on click.** The old code called it immediately, which set action state to `in_progress` ("Drafting..." spinner) before the user chose what to do. Now emails only execute when user clicks "Draft" or types a reply.

3. **Insight tasks skip ConversationPanel's implicit auto-start.** ConversationPanel has a heuristic: "fresh task with no messages → auto-start agent." This fired for newly created email insight tasks even when we didn't want it to. Fix: `task.source === 'insight'` tasks only auto-start via explicit `autoStartAgent` prop, not the implicit heuristic.

4. **Stale action timeout (3 min).** Actions stuck in `in_progress` (from failed agents, page refreshes, or the old code path that executed without starting an agent) now time out after 3 minutes. Legacy actions without a `startedAt` timestamp are timed out immediately. Checked every 15 seconds.

### Files Modified
| File | Change |
|------|--------|
| `app/page.tsx` | Split `handleInsightActionClick` by type: meetings create task + ConversationPanel, emails set `selectedInsightActionId` + InsightDetailPanel. Added `handleEmailExecute` for InsightDetailPanel's onExecute. Right panel renders InsightDetailPanel for emails, ConversationPanel for meetings. |
| `components/insight/InsightView.tsx` | Simplified to pure list — removed internal detail panel rendering, split-view layout, ResizeObserver, `externalDetail`/`onCreateTask`/`onSelectAction` props. Now just calls `onActionClick(action)` and parent handles everything. |
| `components/insight/index.ts` | Kept InsightDetailPanel export |
| `components/ConversationPanel.tsx` | Insight tasks (`task.source === 'insight'`) skip implicit auto-start heuristic — only start via explicit `autoStartAgent` prop |
| `hooks/useInsightScan.ts` | Added `startedAt` timestamp to `LocalActionState`. Added stale action timeout effect (3 min for timestamped, immediate for legacy). |
| `components/insight/InsightDetailPanel.tsx` | Unchanged — retained for email actions |

### Deleted Components (pre-existing, already removed before this phase)
- `InsightActionCard.tsx`, `InsightPanel.tsx`, `InsightScanButton.tsx`, `OfferBundle.tsx`, `OfferItem.tsx`, `PrepDetailView.tsx`, `QuickWinCard.tsx`

### Testing
- [x] Click meeting → ConversationPanel with agent running → results with QuickReferenceCard
- [x] Already-prepped meeting → shows existing task's ConversationPanel
- [x] Click email → InsightDetailPanel with email body + "Draft for me" / "Write it myself"
- [x] Email doesn't auto-draft on click (no spinner, no agent start)
- [x] Close right panel → back to insight list (insightSelected stays true)
- [x] Regular tasks unaffected
- [x] 3-pane layout: TaskList | InsightView | right panel
- [x] Stale "Preparing..."/"Drafting..." actions time out
- [x] Build: lint, typecheck, build pass

---

## Future: Haiku Routing for Task Execution

Not now — need usage data first. If simple tasks (≤1 tool call) >40% of volume, route to Haiku.

---

## Future: Automated Agent Testing

### Problem
All agent testing is manual — trigger scans, type tasks, visually inspect results. This is slow, unreliable, and doesn't catch regressions. Each phase adds more test cases that need to be verified after every change.

### Approaches to Investigate

1. **Recorded fixtures + replay**: Record real Google API responses (emails, calendar events, contacts) as JSON fixtures. Replay them in tests by mocking the Google API layer. This tests the full agent loop (tool selection, orchestration, result formatting) without live API calls.

2. **LLM-as-judge**: Run the agent on canned tasks, then use a separate LLM call to evaluate the output against criteria (e.g., "Does the meeting prep include LinkedIn URLs for unfamiliar contacts?", "Did the triage only include HIGH priority emails?"). Slower but catches quality regressions that assertions miss.

3. **Tool call sequence assertions**: For known tasks, assert that the agent called the right tools in the right order. E.g., "prep for meeting" should call `calendar_list` then `meeting_prep`. Doesn't validate output quality but catches broken tool routing.

4. **Snapshot testing**: Run agent on fixture data, snapshot the output. Diff against previous run. Flag changes for human review. Good for catching unintended regressions from prompt or scoring changes.

### Key Challenges
- Google OAuth tokens expire — tests need either fixtures or a test account with long-lived tokens
- Agent output is non-deterministic (LLM responses vary) — need fuzzy assertions
- Some tests require real web search results (meeting prep web research) — need to decide what to mock vs. hit live
- Cost: each full agent run costs ~$0.02-0.05 in API calls — CI bill adds up

### Next Steps
- Start with approach 1 (fixtures + replay) for the core tool execution layer
- Add approach 3 (tool call assertions) for agent loop behavior
- Consider approach 2 (LLM-as-judge) for quality-sensitive features like meeting prep and email drafts
