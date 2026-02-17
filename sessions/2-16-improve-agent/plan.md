# Agent Improvements: Core Fixes & Token Optimization

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
- [~] Test 1: "Message andrew I'm running 10 min late" → **Issues found:**
  - Phone numbers use `tel:` (opens FaceTime) instead of `sms:` (opens Messages) for "message" tasks
  - Agent pre-selects a contact ("Text Andrew Hogue and Call") instead of just showing the list
  - Should check calendar to disambiguate (if meeting with an Andrew today, that's probably who they mean)
- [ ] Test 2: "Call clipper about the overcharge" → phone should be tappable
- [ ] Test 3: "What emails need my attention today?" → scannable list with links, includes recent unanswered
- [ ] Test 4: "Do I meet with Andrew regularly?" → show ALL Andrews with patterns
- [ ] Test 5: "Check my email from Tim about working together" → find recent Tim first
- [ ] Test 6: "When am I free Thursday afternoon?" → only afternoon, all-day events as notes
- [ ] Test 7: "Create a workout schedule" → verify existing schedule before proposing

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

## Phase 4: Parallel Tool Execution

**Why:** Tools execute sequentially even when Claude returns multiple tool_use blocks. Parallelizing read-only tools cuts latency ~2x.

**Files:** `/lib/ai/anthropic.ts`

- [ ] Split tool calls into read-only (parallel via `Promise.all`) and write (sequential)
- [ ] Emit `tool_start` events before parallel execution
- [ ] Commit

### Testing
- [ ] Multi-tool tasks noticeably faster
- [ ] Write tools still execute after read tools
- [ ] Error in one parallel tool doesn't block others

---

## Phase 5: Cost & Token Logging

**Why:** Need per-task cost data for pricing and Haiku routing decisions.

**Files:** `/lib/ai/cost-logger.ts` (new), `/lib/ai/types.ts`, `/lib/ai/anthropic.ts`, `/app/api/scan/route.ts`, `/lib/gemini.ts`, `.gitignore`

- [ ] `logCost()` — JSONL logger with model pricing, cache tracking, per-call breakdown
- [ ] Hook into agent loop, scan analysis, Gemini research, Gemini chat
- [ ] Commit

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

## Phase 7: Haiku for Insight Scan

**Why:** Scan analysis is structured categorization — Haiku handles it at ~12x lower cost.

- [ ] Switch model in `analyzeContext` to `claude-haiku-4-5-20251001`
- [ ] Commit, compare quality to Sonnet baseline, revert if needed

---

## Phase 8: End-to-End Verification

- [ ] All test cases pass on mobile PWA
- [ ] Long-tail tasks work without specific prompt rules
- [ ] Cost logs for all AI call types
- [ ] Token usage comparison before/after prompt restructure

---

## Future: Haiku Routing for Task Execution

Not now — need usage data first. If simple tasks (≤1 tool call) >40% of volume, route to Haiku.
