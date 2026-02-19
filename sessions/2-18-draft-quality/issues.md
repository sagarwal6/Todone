# Draft Quality Issues — Open Problems

**Branch:** `feature/improve-agent` (uncommitted changes)
**Context:** Phase 17 of `sessions/2-16-improve-agent/plan.md`

## Summary

The email drafting flow in InsightDetailPanel has had significant UI improvements but the **draft output quality is still poor**. The `tone_analyze` tool detects style signals correctly, but the agent doesn't reliably follow them. The core problem: there are too many layers of prompting (system prompt, getDraftResponsePrompt in prompts.ts, tone_analyze recommendation, gmail_draft tool description) that give overlapping and sometimes conflicting guidance about how to write.

## Open Issues

### 1. Drafts don't match user's writing style

**Symptoms:**
- Missing proper sentence capitalization (user capitalizes, draft doesn't)
- Missing user's signature (user always signs "Thanks, Shalini" — draft omits it or uses wrong format)
- Wrong spacing — extra blank lines between greeting and body that user never uses
- Grammar/formatting feels rough, not polished

**Root cause:** The `tone_analyze` tool now detects these signals (`usesProperCapitalization`, `blankLineAfterGreeting`, `signOffExamples`) and puts them in the `recommendation` string. But the agent has 4 competing sources of style guidance:
1. `getDraftResponsePrompt()` in `lib/scan/prompts.ts` — 130-line prompt with its own tone matching steps (search sent emails, match per-recipient style, etc.)
2. `tone_analyze` tool results — includes samples, styleSignals, and recommendation
3. `gmail_draft` tool description — says "No sign-off unless it's a formal email" (contradicts tone_analyze findings)
4. System prompt principles in `lib/ai/anthropic.ts`

These overlap and contradict. The agent sometimes follows the prompts.ts instructions (search its own sent emails manually) and ignores tone_analyze results. Other times it follows tone_analyze but ignores the spacing/capitalization signals.

**What needs to happen:**
- Decide on ONE authoritative source for tone/style. The `tone_analyze` tool should be it — it has the data.
- `getDraftResponsePrompt()` should tell the agent to call `tone_analyze` and follow its results, NOT duplicate tone-matching with its own 5-step process.
- `gmail_draft` tool description should not have style rules (currently says "No sign-off unless formal" which overrides what the analyzer found).
- The prompt architecture from Phase 1b (principles > prescriptions) should apply here: tone_analyze results ARE the data, the prompt just says "follow them."

### 2. Redraft produces different quality/length than first draft

**Symptoms:**
- First draft: short, concise, good
- Redraft: long, verbose, different approach

**Current fix (partial):** `handleGenerateDraft` now captures the user's original direction in a ref and sends the identical `userDirection` on redraft. But since the agent runs fresh each time (new task, new agent loop), it may get different tone_analyze samples or make different tool calls.

**What needs to happen:**
- This may be inherent non-determinism in LLM output. Consider whether redraft should literally re-run the same prompt or if there's a way to cache the tone_analyze results from the first draft.

### 3. Prompt architecture for drafting is tangled

**The flow today:**
1. User clicks "Draft" → `handleGenerateDraft()` → `onExecute(actionId, userDirection, 'draft')`
2. → `scan.executeAction()` → POST `/api/scan/actions/[id]/execute`
3. → `getActionExecutionPrompt()` → `getDraftResponsePrompt()` in `lib/scan/prompts.ts`
4. → Returns 130-line prompt with 5 steps (learn tone, read email, check scheduling, draft in voice, create reply)
5. → This prompt becomes the task title/prompt for the agent loop
6. → Agent loop starts in `anthropic.ts` with system prompt + this task prompt
7. → Agent calls `tone_analyze` (if it follows Step 1) OR manually searches sent emails (because Step 1 also tells it to search)
8. → Agent calls `gmail_draft` with its best guess at tone

**The problem:** Step 1 of the prompt tells the agent to search sent emails manually AND there's a dedicated `tone_analyze` tool that does the same thing but better. The agent sometimes does both (wasting tokens) or does neither (when it shortcuts).

**What needs to happen:**
- `getDraftResponsePrompt()` should be simplified: "Call tone_analyze, read the email, draft a reply following the tone_analyze results."
- The 5-step process in prompts.ts should be replaced with 3 steps: (1) tone_analyze, (2) read email, (3) draft.
- Scheduling detection (Step 3) can stay but shouldn't be interleaved with tone matching.

### 4. `gmail_draft` tool description conflicts with analyzer

**Current:** `"No sign-off unless it's a formal email"`
**Problem:** This overrides tone_analyze results. If the analyzer found the user ALWAYS signs off with "Thanks, Shalini", the tool description tells the agent to skip it.

**Fix:** Remove style rules from `gmail_draft` description entirely. The tool creates a draft — it shouldn't dictate style. Style comes from `tone_analyze`.

## Files to Modify

| File | What | Priority |
|------|------|----------|
| `lib/scan/prompts.ts` | Simplify `getDraftResponsePrompt()` — remove manual tone Steps 1/4, rely on tone_analyze | HIGH |
| `lib/ai/tools.ts` | Remove style rules from `gmail_draft` description | HIGH |
| `lib/ai/execute-tool.ts` | Verify tone_analyze returns sign-off examples with user's name, capitalization signal | MEDIUM |
| `lib/ai/anthropic.ts` | Check system prompt doesn't have conflicting style guidance | LOW |

## What's Working Well (keep)

- **UI flow:** InsightDetailPanel email reading → draft generation → redraft → copy → open in Gmail
- **Agent progress during drafting:** DraftWarmupSteps → real AgentProgress → textarea with draft
- **State restoration:** Navigate away during draft, come back, see progress or completed draft
- **Tone analyzer detection:** blankLineAfterGreeting, blankLineBeforeSignOff, usesProperCapitalization, signOffExamples all correctly detected
- **Redraft mechanics:** Same prompt, API allows re-execution of completed actions, state resets cleanly

## Testing Plan

For each fix, test with 3 email types:
1. **Casual reply** (to a friend/close colleague) — should match informal tone, include sign-off if user always does
2. **Professional reply** (to an external contact) — proper capitalization, formal greeting, full sign-off
3. **Quick acknowledgment** (1-2 line reply) — should stay short, not over-elaborate

Verify:
- [ ] Capitalization matches user's pattern
- [ ] Sign-off matches user's pattern (including their name)
- [ ] No extra blank lines between greeting and body (if user doesn't use them)
- [ ] Draft length is appropriate (not verbose)
- [ ] Redraft produces similar quality/length as first draft
