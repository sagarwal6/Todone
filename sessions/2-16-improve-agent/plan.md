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

## Phase 1: System Prompt Overhaul

**Why:** Addresses 10 of 12 issues. No code changes, no risk, cached so minimal token cost.

**Files:** `/lib/ai/anthropic.ts` (system prompt), `/lib/ai/tools.ts` (calendar_list description)

- [ ] **1a. Add MINIMUM VIABLE ACTION section** (#10) — do least work needed; "message Rajan" = contacts_search only
- [ ] **1b. Add CHOOSING COMMUNICATION METHOD section** (#2) — text/sms for casual, email for formal; never email when text would do
- [ ] **1c. Add CALENDAR SEARCH RANGES section** (#3) — patterns: 90 days; next event: 30 days; free slots: that day only
- [ ] **1c-tools. Update `calendar_list` tool description** in `tools.ts` — mention 90-day range for patterns
- [ ] **1d. Add CALENDAR EVENT TYPES section** (#9) — all-day events don't block time; only time-specific events count
- [ ] **1e. Add AMBIGUOUS NAMES section** (#6) — show ALL matches, don't pick one
- [ ] **1f. Add EMAIL SEARCH STRATEGY section** (#7, #8) — prioritize recent; translate intent to operators; triage = today + recent unanswered
- [ ] **1g. Add VERIFY BEFORE PROPOSING section** (#11) — show what you found, confirm, then propose
- [ ] **1h. Replace OUTPUT FORMAT section** (#4, #12) — scannable one-line-per-item lists with Gmail links; ⚡ for time-sensitive
- [ ] **1i. Add CONNECT THE DOTS section** — cross-reference calendar meetings with related emails
- [ ] **1j. Add AI MOVE section** — optional one-line power-user tip after task completion; must require a different tool (Claude chat, ChatGPT, Cursor, etc.) and be 10x scale/depth beyond what Todone did; skip if no genuinely clever angle; format: "💡 **AI Move:** [workflow in specific tool]"
- [ ] **Phase 1 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 1 Testing
- [ ] Test 1: "Message [friend] I'm running 10 min late" → phone/sms link, NOT email
- [ ] Test 2: "Call clipper about the overcharge" → phone should be tappable (also Phase 2)
- [ ] Test 3: "What emails need my attention today?" → scannable list with links, includes recent unanswered
- [ ] Test 4: "Do I meet with Andrew regularly?" → show ALL Andrews with patterns
- [ ] Test 5: "Check my email from Tim about working together" → find recent Tim first
- [ ] Test 6: "When am I free Thursday afternoon?" → only afternoon, all-day events as notes
- [ ] Test 7: "Create a workout schedule" → verify existing schedule before proposing

---

## Phase 2: Auto-Link Phone Numbers & URLs in Markdown

**Why:** Phone numbers and URLs in agent body text aren't tappable. Critical for mobile UX.

**Files:** `/components/ui/Markdown.tsx`, `package.json`

- [ ] **2a. Install `remark-gfm`** — `npm install remark-gfm`
- [ ] **2b. Add `autoLinkPhones()` preprocessor** — regex to wrap bare phone numbers in `[number](tel:digits)`, skip already-linked
- [ ] **2c. Update `<a>` handler** — `tel:` and `sms:` URIs use `window.location.href` (direct nav), others open new tab
- [ ] **2d. Add `remarkGfm` plugin** — enables bare URL auto-linking in Markdown output
- [ ] **Phase 2 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 2 Testing
- [ ] Phone in body text → tappable, opens dialer on mobile
- [ ] URL in body text → tappable, opens in new tab
- [ ] `sms:` links from agent → opens texting app
- [ ] Existing markdown links still work (no double-linking)
- [ ] Phone numbers already in `[text](tel:)` format not double-wrapped

---

## Phase 3: Clickable Email Sources

**Why:** When agent references emails, user should tap to open in Gmail.

**Files:** `/lib/google/gmail.ts`, `/lib/ai/anthropic.ts` (prompt already done in Phase 1h)

- [ ] **3a. Add `gmailUrl` to `EmailMetadata` interface** in `gmail.ts`
- [ ] **3b. Set `gmailUrl` in `parseEmailMetadata`** — `https://mail.google.com/mail/u/0/#inbox/${message.id}`
- [ ] **Phase 3 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 3 Testing
- [ ] Agent references email → email name is clickable Gmail link
- [ ] Click opens correct message in Gmail
- [ ] On mobile: opens Gmail app if installed

---

## Phase 4: Parallel Tool Execution

**Why:** Tools execute sequentially even when Claude returns multiple tool_use blocks. Parallelizing read-only tools cuts latency ~2x on multi-tool tasks.

**Files:** `/lib/ai/anthropic.ts` (tool execution loop, ~line 441)

- [ ] **4a. Import `READ_ONLY_TOOLS`** from `./tools` (already exported)
- [ ] **4b. Split tool calls** — separate read-only (safe to parallelize) from write tools (sequential)
- [ ] **4c. Execute read-only tools with `Promise.all`** — same per-tool logic (persist, emit, execute, update), just concurrent
- [ ] **4d. Execute write tools sequentially after** — gmail_draft, calendar_create need confirmation
- [ ] **4e. Emit all `tool_start` events before parallel execution** — so UI shows them as concurrent
- [ ] **Phase 4 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 4 Testing
- [ ] Multi-tool tasks complete noticeably faster
- [ ] Tool results still appear correctly in UI
- [ ] Write tools still execute after read tools
- [ ] Error in one parallel tool doesn't block others
- [ ] SSE events stream correctly (tool_start before tool_result for each)

---

## Phase 5: Cost & Token Logging

**Why:** Need to see what each task type costs for pricing, Haiku routing decisions, and budget tuning. Currently only a single `total_tokens_used` number — no input/output breakdown, no cache hits, no cost, scans track nothing.

**Files:** `/lib/ai/cost-logger.ts` (new), `/lib/ai/types.ts`, `/lib/ai/anthropic.ts`, `/app/api/scan/route.ts`, `/app/api/chat/route.ts`, `/lib/gemini.ts`, `.gitignore`

- [ ] **5a. Add `CostLogEntry` type** to `types.ts` — timestamp, type, model, userId, tokens, cost, cache, iterations, toolNames, duration
- [ ] **5b. Create `/lib/ai/cost-logger.ts`** — `logCost()` appends JSONL to `logs/cost.jsonl`; `estimateCost()` and `estimateCacheSavings()` with model pricing table
- [ ] **5c. Track detailed token usage in agentic loop** — replace single `totalTokens +=` with input/output/cacheCreate/cacheRead accumulators
- [ ] **5d. Log agent task cost** — call `logCost()` with full breakdown when task completes (type: `'agent'`)
- [ ] **5e. Log scan analysis cost** — call `logCost()` in `analyzeContext` after API call (type: `'scan'`)
- [ ] **5f. Log Gemini research cost** — call `logCost()` in `lib/gemini.ts` after `generateContent` (type: `'research'`)
- [ ] **5g. Log Gemini chat cost** — call `logCost()` in `/app/api/chat/route.ts` after `generateContent` (type: `'chat'`)
- [ ] **5h. Add `logs/` to `.gitignore`**
- [ ] **Phase 5 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 5 Testing
- [ ] Run a few tasks → verify JSONL lines appear in `logs/cost.jsonl` with reasonable numbers
- [ ] Verify cache read tokens are non-zero (prompt caching working)
- [ ] Verify scan cost logs appear after insight scan
- [ ] Verify Gemini research/chat logs appear
- [ ] `jq` analysis commands work on the file

---

## Phase 6: Haiku for Insight Scan Analysis

**Why:** Scan analysis is structured categorization — Haiku 4.5 handles it well at ~12x lower cost ($0.037/scan → $0.003/scan).

**Files:** `/app/api/scan/route.ts` (`analyzeContext` function)

- [ ] **6a. Switch model to Haiku** — change `'claude-sonnet-4-20250514'` to `'claude-haiku-4-5-20251001'` in `analyzeContext`
- [ ] **Phase 6 commit** — `npm run lint && npm run typecheck && npm run build`

### Phase 6 Testing
- [ ] Run 3 scans with Haiku, compare output quality to Sonnet baseline
- [ ] Verify: correct action types, reasonable priorities, valid JSON output
- [ ] Check greeting/portrait quality — should still feel personal, not generic
- [ ] Verify cost.jsonl shows lower scan costs
- [ ] If quality drops: revert (one line change)

---

## Phase 7: Verify & Optimize

### End-to-end testing (mobile PWA)
- [ ] Tappable phones/URLs/email links throughout
- [ ] Concise output, no filler
- [ ] Correct communication method choices
- [ ] Calendar patterns detected with 90-day range
- [ ] Scannable list format for email triage
- [ ] ⚡ urgency flags on time-sensitive items
- [ ] Calendar+email cross-references when relevant
- [ ] Multi-tool tasks feel faster (parallel execution)
- [ ] Cost logs appearing for all 4 AI call types

### Token monitoring
- [ ] Compare token usage before/after on same tasks
- [ ] Test 1 ("message Rajan") should drop from ~4 tool calls to 1
- [ ] System prompt growth (+150 tokens) offset by fewer tool calls and shorter responses
- [ ] Compare scan cost: Haiku vs Sonnet in cost.jsonl

### Pre-commit
- [ ] `npm run lint && npm run typecheck && npm run build`

---

## Future Investigation: Haiku Routing for Task Execution

**Not implementing now** — flagging for future consideration once we have usage data from Phase 5.

### Idea
Route simple, single-tool tasks to Haiku 4.5 instead of Sonnet 4. Examples:
- "What's Rajan's number?" → contacts_search → one-line answer
- "When's my next dentist appointment?" → calendar_list → one-line answer

### Why not now
- We don't yet know how reliably we can classify task complexity upfront
- A wrong classification (sending a complex task to Haiku) would produce a bad result
- Need usage data to understand the distribution of simple vs complex tasks
- The "MINIMUM VIABLE ACTION" prompt changes may already reduce Sonnet costs enough

### When to revisit
- After 2-4 weeks of usage data with the new prompt
- If simple tasks (≤1 tool call) represent >40% of tasks, the savings justify the complexity
- Could use a lightweight classifier: if task matches known simple patterns (contact lookup, single calendar check), route to Haiku; otherwise default to Sonnet
