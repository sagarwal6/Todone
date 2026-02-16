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

### Files
- `/lib/ai/anthropic.ts` (system prompt, lines 76-270)
- `/lib/ai/tools.ts` (calendar_list description, line 126)

### Changes

**1a. MINIMUM VIABLE ACTION** (new section, addresses #10)
```
MINIMUM VIABLE ACTION:
Do the LEAST work needed to accomplish the task. Don't search everything just because you can.
- "Message Rajan I'm running late" → contacts_search for phone. Done. Don't search calendar, email, or draft an email.
- "What's John's number?" → contacts_search. Done.
- Only use tools that directly serve the user's stated goal.
```

**1b. COMMUNICATION METHOD** (new section, addresses #2)
```
CHOOSING COMMUNICATION METHOD:
- "message/text/tell X [something casual]" → contacts_search for phone → provide tappable link
  - Personal contact: "[Text Rajan](sms:2679758830&body=Running 10 min late)" and "[Call](tel:2679758830)"
  - Business: "[Call](tel:number)" only
- "email X" or formal/detailed/group → gmail_draft
- If no phone found, fall back to email and note why.
- NEVER draft an email when a text would do.
```

**1c. CALENDAR SEARCH RANGES** (new section, addresses #3)
```
CALENDAR SEARCH RANGES:
- Pattern/recurring check ("do I meet with X regularly?"): Search LAST 90 DAYS minimum. Patterns may have lapsed recently.
- "When's my next X?": Search next 30 days
- "When am I free [day]?": Search just that day
- Upcoming events: Default 7-day range is fine
```

Also update `calendar_list` tool description in `tools.ts` line 126:
```
"List calendar events in a time range. Default: next 7 days. For patterns/recurring: use last 90 days. Returns ID, title, times, location, attendees."
```

**1d. ALL-DAY EVENTS vs TIME BLOCKS** (new section, addresses #9)
```
CALENDAR EVENT TYPES:
All-day events (birthdays, holidays, reminders) do NOT block time. When checking availability:
- Only count events with specific start/end TIMES as blocking
- All-day events are informational — mention them as a note, not as blocking time
- "You're free 1-6pm. (Note: Rajan's birthday today)"
Also: if user asks about "afternoon", only show afternoon events. Don't list the whole day.
```

**1e. AMBIGUOUS NAMES** (new section, addresses #6)
```
AMBIGUOUS NAMES:
When a name matches multiple contacts or calendar entries, show ALL matches — don't pick one.
- "Do I meet with Andrew regularly?" → Show BOTH "Andrew Hogue: every 3 weeks" and "Andrew Poon: monthly"
- Let the user clarify which one, or show all patterns.
```

**1f. EMAIL SEARCH STRATEGY** (new section, addresses #7, #8)
```
EMAIL SEARCH STRATEGY:
- ALWAYS prioritize recent emails. Start with newer_than:6m, broaden only if needed.
- Do NOT use the user's exact words as Gmail query. Translate intent to search operators.
  BAD: user says "working together" → query "from:tim working together"
  GOOD: user says "working together" → query "from:tim newer_than:1y" then scan for collaboration topics
- "What needs my attention?" means:
  1. Search in:inbox newer_than:1d (today's new emails)
  2. Search is:unread older_than:1d newer_than:5d (unanswered from recent days)
  Report both.
```

**1g. VERIFY BEFORE PROPOSING** (new section, addresses #11)
```
VERIFY BEFORE PROPOSING:
When creating plans/schedules based on calendar data:
- First show what you found: "Found Krishnan PT on M/W/F and Yoga on Sundays"
- Ask if that's correct and what the user's goals are
- THEN propose a plan based on verified data
Don't build a detailed proposal on top of unverified assumptions.
```

**1h. OUTPUT FORMAT: SCANNABLE LISTS WITH LINKS** (addresses #4, #12)

Replace the verbose output examples in the existing conciseness section with:
```
OUTPUT FORMAT:
- Email triage → scannable list, one line per email, with Gmail links:
  "2 need attention:
  ⚡ [Persis: Mexico City trip](gmailUrl) — wants feedback by EOD → [Google Doc](link)
  • [Self-reminder: pickleball](gmailUrl) — empty, unread
  6 promos — skip."
- Flag time-sensitive items with ⚡ (deadlines, expiring offers, same-day requests)
- Calendar check → just the free slots, not every event
- Contact lookup → just the info, one line
- NEVER repeat your conclusion. Say it once.
- NEVER start with "Based on my analysis..." or "Perfect! I have everything..."
```

**1i. CROSS-REFERENCE CALENDAR + EMAIL** (new section)
```
CONNECT THE DOTS:
If the user has a meeting with X today AND an email from X, mention the connection.
- "Meeting with Tim at 3pm — his email from this morning about the proposal is probably related."
- "Lunch with Sarah tomorrow — she sent availability options yesterday."
Don't force connections that aren't there. Only mention when the link is obvious and useful.
```

### Token impact
Net ~+600 chars to system prompt (~150 tokens). With prompt caching at 10% rate, this costs ~15 tokens per task. Offset by reduced tool calls (minimum viable action) and shorter agent responses.

### Testing
Re-run all 7 test tasks from our testing session:
1. "Message [friend] I'm running 10 min late" → should give phone/sms link, NOT email
2. "Call clipper about the overcharge" → phone should be tappable (also Phase 2)
3. "What emails need my attention today?" → scannable list with links, includes recent unanswered
4. "Do I meet with Andrew regularly?" → show ALL Andrews with patterns
5. "Check my email from Tim about working together" → find recent Tim first
6. "When am I free Thursday afternoon?" → only afternoon, all-day events as notes
7. "Create a workout schedule" → verify existing schedule before proposing

---

## Phase 2: Auto-Link Phone Numbers & URLs in Markdown

**Why:** Phone numbers and URLs in agent body text aren't tappable. Critical for mobile UX.

### Files
- `/components/ui/Markdown.tsx`
- `package.json` (new dep: `remark-gfm`)

### Changes

**2a. Install `remark-gfm`:**
```bash
npm install remark-gfm
```

**2b. Add phone number preprocessing** in `Markdown.tsx`:
```typescript
function autoLinkPhones(text: string): string {
  // Match (123) 456-7890, 123-456-7890, +1 123-456-7890, 1-800-207-7847
  // Skip if already inside a markdown link [text](url)
  return text.replace(
    /(?<!\[)(?<!\]\()(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?!\]|\))/g,
    (match) => {
      const digits = match.replace(/\D/g, '');
      return `[${match}](tel:${digits})`;
    }
  );
}
```

**2c. Update `<a>` handler** for `tel:` and `sms:` URIs:
```typescript
a: ({ href, children }) => (
  <a
    href={href}
    onClick={(e) => {
      e.preventDefault();
      if (href?.startsWith('tel:') || href?.startsWith('sms:')) {
        window.location.href = href;  // Direct nav for phone/sms
      } else if (href) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    }}
    className="text-inbox-accent hover:underline"
  >
    {children}
  </a>
)
```

**2d. Add `remarkGfm` plugin** for bare URL auto-linking:
```typescript
import remarkGfm from 'remark-gfm';

export function Markdown({ content, className = '' }: MarkdownProps) {
  const processed = autoLinkPhones(content);
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={...}>
      {processed}
    </ReactMarkdown>
  );
}
```

### Token impact
None (UI only).

### Testing
- Phone in body text → tappable, opens dialer on mobile
- URL in body text → tappable, opens in new tab
- `sms:` links from agent → opens texting app
- Existing markdown links still work (no double-linking)
- Phone numbers already in `[text](tel:)` format not double-wrapped

---

## Phase 3: Clickable Email Sources

**Why:** When agent references emails, user should tap to open in Gmail.

### Files
- `/lib/google/gmail.ts` — add `gmailUrl` to `EmailMetadata` interface and `parseEmailMetadata`
- `/lib/ai/anthropic.ts` — prompt guidance (included in Phase 1h above)

### Changes

**3a. Add `gmailUrl` to `EmailMetadata`** (`gmail.ts` line 18):
```typescript
export interface EmailMetadata {
  // ... existing fields ...
  gmailUrl: string;
}
```

**3b. Set in `parseEmailMetadata`** (`gmail.ts` ~line 227, before the closing `};`):
```typescript
  gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${message.id}`,
```

### Token impact
- ~+60 chars per email in tool results. For 10 emails: +600 chars, within 8000 truncation limit.

### Testing
- Agent references specific email → email name is clickable Gmail link
- Click opens correct message in Gmail
- On mobile: opens Gmail app if installed

---

## Phase 4: Parallel Tool Execution

**Why:** Currently tools execute sequentially even when Claude returns multiple tool_use blocks in one response. For tasks like "what needs my attention?" the agent might call `gmail_search` + `calendar_list` simultaneously, but they run one after another. Parallelizing read-only tools cuts latency significantly.

### Files
- `/lib/ai/anthropic.ts` (tool execution loop, ~line 441)

### Changes

**4a. Replace sequential `for` loop with parallel execution for read-only tools:**

Current code (sequential):
```typescript
for (const toolCall of toolCalls) {
  // ... execute one at a time
}
```

New approach:
```typescript
// Separate read-only tools (safe to parallelize) from write tools (must be sequential)
const readOnlyTools = toolCalls.filter(tc => READ_ONLY_TOOLS.has(tc.name));
const writeTools = toolCalls.filter(tc => !READ_ONLY_TOOLS.has(tc.name));

// Execute all read-only tools in parallel
const readResults = await Promise.all(readOnlyTools.map(async (toolCall) => {
  // ... same per-tool logic (persist step, emit events, execute, update step)
}));

// Then execute write tools sequentially (they need user confirmation)
for (const toolCall of writeTools) {
  // ... same existing sequential logic
}
```

Import `READ_ONLY_TOOLS` from `./tools` (already exported).

**4b. Emit parallel tool_start events** before execution begins:
```typescript
// Emit all starts first so UI shows them as concurrent
for (const toolCall of readOnlyTools) {
  await onProgress({ type: 'tool_start', tool: toolCall.name, args: toolCall.input, timestamp: Date.now() });
}
// Then execute in parallel
```

### Token impact
None (same API calls, same responses). Pure latency improvement.

### Expected latency improvement
- Email triage (`gmail_search` + `calendar_list`): ~10s → ~5s (parallel API calls)
- Tasks needing contact + calendar: ~8s → ~5s
- No improvement for single-tool tasks (already fast)

### Testing
- Multi-tool tasks should complete noticeably faster
- Tool results still appear in correct order in UI
- Write tools (gmail_draft, calendar_create) still execute after read tools
- Error in one parallel tool doesn't block others
- SSE events still stream correctly (tool_start before tool_result for each)

---

## Phase 5: Cost & Token Logging

**Why:** We need to see what each task type costs to make informed decisions (Haiku routing, pricing, budget tuning). Currently we only store a single `total_tokens_used` number — no input/output breakdown, no cache hits, no cost, and insight scans track nothing at all.

### What the Anthropic SDK already gives us (free)

```typescript
response.usage = {
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens?: number,  // tokens written to cache
  cache_read_input_tokens?: number,      // tokens read from cache (90% cheaper)
}
```

We're ignoring `cache_creation_input_tokens` and `cache_read_input_tokens` entirely.

### Files
- `/lib/ai/cost-logger.ts` — **new file**, shared cost logging utility
- `/lib/ai/anthropic.ts` — track detailed usage per iteration, call logger at end
- `/lib/ai/types.ts` — add `CostLogEntry` type
- `/app/api/scan/route.ts` — log scan analysis tokens
- `/app/api/chat/route.ts` — log chat tokens (Gemini)
- `/lib/gemini.ts` — log research tokens (Gemini)

### Approach: JSONL file

Append one JSON object per line to `logs/cost.jsonl`. JSONL is:
- Human-readable (`cat logs/cost.jsonl | jq`)
- Greppable (`grep '"type":"agent"' logs/cost.jsonl`)
- Easy to load into a script/spreadsheet later
- Grows forever (rotate manually or add rotation later if needed)

The file lives outside the build directory so it persists across deploys. Add `logs/` to `.gitignore`.

### Changes

**5a. Add `CostLogEntry` type** (`types.ts`):
```typescript
export interface CostLogEntry {
  timestamp: string;        // ISO 8601
  type: 'agent' | 'scan' | 'research' | 'chat' | 'web_search';
  model: string;            // e.g. 'claude-sonnet-4-20250514', 'gemini-2.0-flash'
  userId: string;
  taskId?: string;
  taskTitle?: string;
  // Token breakdown
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  // Derived
  totalTokens: number;
  estimatedCost: number;    // USD
  cacheSavings?: number;    // USD saved by cache
  // Agent-specific
  iterations?: number;
  toolCalls?: number;
  toolNames?: string[];     // which tools were used
  // Duration
  durationMs?: number;
}
```

**5b. Create `/lib/ai/cost-logger.ts`:**
```typescript
import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import type { CostLogEntry } from './types';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'cost.jsonl');

// Model pricing (USD per 1M tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export function estimateCacheSavings(model: string, cacheReadTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  // Cache reads cost 10% of input price, so savings = 90% of input price
  return (cacheReadTokens / 1_000_000) * pricing.input * 0.9;
}

let ensuredDir = false;

export async function logCost(entry: CostLogEntry): Promise<void> {
  try {
    if (!ensuredDir) {
      await mkdir(LOG_DIR, { recursive: true });
      ensuredDir = true;
    }
    const line = JSON.stringify(entry) + '\n';
    await appendFile(LOG_FILE, line);
  } catch (err) {
    // Never let logging break the app
    console.error('[COST LOG] Failed to write:', err);
  }
}
```

**5c. Track detailed usage in agentic loop** (`anthropic.ts`, ~line 386):

Replace:
```typescript
totalTokens += response.usage.input_tokens + response.usage.output_tokens;
```

With:
```typescript
const iterInput = response.usage.input_tokens;
const iterOutput = response.usage.output_tokens;
const iterCacheCreate = (response.usage as any).cache_creation_input_tokens || 0;
const iterCacheRead = (response.usage as any).cache_read_input_tokens || 0;

totalInputTokens += iterInput;
totalOutputTokens += iterOutput;
totalCacheCreate += iterCacheCreate;
totalCacheRead += iterCacheRead;
totalTokens += iterInput + iterOutput;
```

**5d. Log when agent task completes** (`anthropic.ts`, after loop ends):

```typescript
import { logCost, estimateCost, estimateCacheSavings } from './cost-logger';

// After the loop, before returning result:
await logCost({
  timestamp: new Date().toISOString(),
  type: 'agent',
  model: config.model,
  userId,
  taskId,
  taskTitle,
  inputTokens: totalInputTokens,
  outputTokens: totalOutputTokens,
  cacheCreationTokens: totalCacheCreate,
  cacheReadTokens: totalCacheRead,
  totalTokens,
  estimatedCost: estimateCost(config.model, totalInputTokens, totalOutputTokens),
  cacheSavings: estimateCacheSavings(config.model, totalCacheRead),
  iterations: iteration,
  toolCalls: succeededSteps.length,
  toolNames: succeededSteps,
  durationMs: Date.now() - startTime,  // add startTime = Date.now() at top of loop
});
```

**5e. Log scan analysis cost** (`/app/api/scan/route.ts`, in `analyzeContext`):

```typescript
import { logCost, estimateCost } from '@/lib/ai/cost-logger';

// After API call, before returning:
const scanModel = 'claude-sonnet-4-20250514'; // changes to haiku in Phase 6
await logCost({
  timestamp: new Date().toISOString(),
  type: 'scan',
  model: scanModel,
  userId: profile.id, // pass into analyzeContext
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  totalTokens: response.usage.input_tokens + response.usage.output_tokens,
  estimatedCost: estimateCost(scanModel, response.usage.input_tokens, response.usage.output_tokens),
});
```

**5f. Log Gemini research cost** (`/lib/gemini.ts`, after `generateContent`):

```typescript
import { logCost, estimateCost } from './ai/cost-logger';

// After result = await model.generateContent(...)
const usage = result.response.usageMetadata;
if (usage) {
  await logCost({
    timestamp: new Date().toISOString(),
    type: 'research',
    model: 'gemini-2.0-flash',
    userId: 'unknown', // research endpoint doesn't have userId easily
    taskTitle: taskTitle,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
    estimatedCost: estimateCost('gemini-2.0-flash', usage.promptTokenCount || 0, usage.candidatesTokenCount || 0),
  });
}
```

**5g. Log Gemini chat cost** (`/app/api/chat/route.ts`, after `generateContent`):

Same pattern as 5f but with `type: 'chat'`.

**5h. Add `logs/` to `.gitignore`.**

### Sample `logs/cost.jsonl` output

```jsonl
{"timestamp":"2026-02-16T15:30:00Z","type":"agent","model":"claude-sonnet-4-20250514","userId":"abc","taskId":"t1","taskTitle":"Message Rajan I'm late","inputTokens":1800,"outputTokens":200,"cacheCreationTokens":0,"cacheReadTokens":1200,"totalTokens":2000,"estimatedCost":0.0084,"cacheSavings":0.0032,"iterations":2,"toolCalls":1,"toolNames":["contacts_search"],"durationMs":3200}
{"timestamp":"2026-02-16T15:31:00Z","type":"agent","model":"claude-sonnet-4-20250514","userId":"abc","taskId":"t2","taskTitle":"What emails need attention","inputTokens":9500,"outputTokens":1200,"cacheCreationTokens":0,"cacheReadTokens":1200,"totalTokens":10700,"estimatedCost":0.0465,"cacheSavings":0.0032,"iterations":4,"toolCalls":3,"toolNames":["gmail_search","gmail_search","calendar_list"],"durationMs":18400}
{"timestamp":"2026-02-16T15:32:00Z","type":"scan","model":"claude-sonnet-4-20250514","userId":"abc","inputTokens":3200,"outputTokens":1800,"totalTokens":5000,"estimatedCost":0.0366}
{"timestamp":"2026-02-16T15:30:00Z","type":"research","model":"gemini-2.0-flash","userId":"unknown","taskTitle":"Call Clipper about overcharge","inputTokens":1200,"outputTokens":800,"totalTokens":2000,"estimatedCost":0.0004}
```

### Quick analysis commands

```bash
# Total cost today
cat logs/cost.jsonl | jq -s '[.[] | select(.timestamp >= "2026-02-16")] | map(.estimatedCost) | add'

# Cost by type
cat logs/cost.jsonl | jq -s 'group_by(.type) | map({type: .[0].type, cost: map(.estimatedCost) | add, count: length})'

# Most expensive tasks
cat logs/cost.jsonl | jq -s '[.[] | select(.type=="agent")] | sort_by(-.estimatedCost) | .[:5] | .[] | {title: .taskTitle, cost: .estimatedCost, tools: .toolCalls}'

# Average cost per agent task
cat logs/cost.jsonl | jq -s '[.[] | select(.type=="agent")] | {avg_cost: (map(.estimatedCost) | add / length), count: length}'

# Cache hit effectiveness
cat logs/cost.jsonl | jq -s '[.[] | select(.cacheReadTokens > 0)] | {total_saved: map(.cacheSavings) | add}'
```

This directly answers: "What does each task type cost?" and feeds into the Haiku routing decision.

### Token impact
Zero — logging only, no change to API calls.

### Testing
- Run a few tasks, verify log lines appear with reasonable numbers
- Verify cache read tokens are non-zero (prompt caching working)
- Verify scan cost logs appear

---

## Phase 6: Haiku for Insight Scan Analysis

**Why:** The insight scan's `analyzeContext` call uses Sonnet 4 to score/categorize emails and calendar events into structured JSON. This is a well-defined structured task that Haiku 4.5 handles well — at ~12x lower cost per scan.

### Files
- `/app/api/scan/route.ts` (~line 466, `analyzeContext` function)

### Changes

**5a. Switch scan analysis model to Haiku:**
```typescript
// In analyzeContext function
const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',  // Was: 'claude-sonnet-4-20250514'
  max_tokens: 8000,
  system: getInsightAnalysisSystemPrompt(),
  messages: [{ role: 'user', content: getInsightAnalysisUserPrompt(context) }],
});
```

### Cost impact
- Scan analysis typically uses ~3000 input + ~2000 output tokens
- Sonnet 4: ~$0.024/scan → Haiku 4.5: ~$0.002/scan (12x cheaper)
- With multiple scans per user per day, this adds up significantly

### Risk
- Haiku may produce slightly less nuanced greeting/portrait text
- Structured categorization (action types, priorities) should be equally good
- If quality drops noticeably, easy to revert (one line change)

### Testing
- Run 3 scans with Haiku, compare output quality to Sonnet baseline
- Verify: correct action types, reasonable priorities, valid JSON output
- Check greeting/portrait quality — should still feel personal, not generic
- Timing: scan analysis should be faster (~2-3s instead of ~5-8s)

---

## Phase 6: Verify & Optimize

### End-to-end testing
Re-run all 7 test tasks on mobile (PWA). Verify:
- Tappable phones/URLs/email links throughout
- Concise output, no filler
- Correct communication method choices
- Calendar patterns detected
- Scannable list format for triage
- ⚡ urgency flags on time-sensitive items
- Calendar+email cross-references when relevant
- Multi-tool tasks feel faster (parallel execution)

### Token monitoring
- Compare token usage before/after on same tasks
- Test 1 ("message Rajan") should drop from ~4 tool calls to 1
- System prompt growth (+150 tokens) offset by fewer tool calls and shorter responses
- Compare scan cost: Haiku vs Sonnet for insight analysis

### Pre-commit
```bash
npm run lint && npm run typecheck && npm run build
```

---

## Future Investigation: Haiku Routing for Task Execution

**Not implementing now** — flagging for future consideration once we have usage data.

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
