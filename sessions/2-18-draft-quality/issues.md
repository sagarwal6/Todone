# Draft Quality Issues — Current State

**Branch:** `feature/improve-agent`
**Context:** Phase 17 of `sessions/2-16-improve-agent/plan.md`
**Updated:** 2026-02-18

## Summary

The email drafting flow has had significant work: `tone_analyze` tool built, prompt simplified, conflicting style rules removed. But **draft output quality still needs manual verification**. The tone_analyze tool detects style signals correctly — the open question is whether the agent now follows them end-to-end.

## What's Been Fixed (code changes applied)

### Issue 1: Drafts don't match user's writing style — PARTIALLY FIXED
**Code changes applied**, needs manual testing.

- `getDraftResponsePrompt()` simplified from 5 steps (~110 lines) to 4 steps (~40 lines)
- Manual tone-matching steps removed — replaced with "Call tone_analyze, follow its results"
- `gmail_draft` tool description cleaned — removed "No sign-off unless formal", "1-2 sentences max", "No corporate filler"
- Now says "Style and tone come from tone_analyze — follow its recommendation"
- System prompt (anthropic.ts:97) aligned: "Call tone_analyze before drafting"

**Still needs verification:** Does the agent actually follow the recommendation string for capitalization, sign-off (with user's name), and spacing? The detection works — the question is whether the prompting is now strong enough.

### Issue 3: Prompt architecture for drafting is tangled — FIXED
- `getDraftResponsePrompt()` no longer duplicates tone_analyze work
- 4 clear steps: (1) tone_analyze, (2) read email, (3) check calendar if scheduling, (4) create reply
- No competing voices for style guidance

### Issue 4: `gmail_draft` tool description conflicts with analyzer — FIXED
- Style prescriptions removed from `gmail_draft` description
- `tone_analyze` is now the single source of truth for style

## What's Still Open

### Issue 2: Redraft produces different quality/length than first draft — OPEN
**Symptoms:**
- First draft: short, concise, good
- Redraft: long, verbose, different approach

**Current state:** `handleGenerateDraft` captures the user's original direction in a ref and sends the identical `userDirection` on redraft. But the agent runs fresh each time (new agent loop), so it may get different tone_analyze samples or make different tool calls.

**Possible approaches:**
- Cache tone_analyze result from first draft and inject into redraft prompt (skip the tool call)
- Accept some non-determinism — LLMs aren't perfectly reproducible
- Add "keep similar length and approach to previous draft" instruction

### Tone recommendation strength — NEEDS TESTING
The tone_analyze `recommendation` string is descriptive ("User uses proper capitalization, signs off with 'Thanks, Shalini'"). It may need to be more imperative ("YOU MUST use proper capitalization. YOU MUST end with 'Thanks,\nShalini'"). Test first, then adjust if needed.

## Key Files

| File | Role |
|------|------|
| `lib/ai/execute-tool.ts` | `executeToneAnalyze()` — the analyzer. Look at `buildRecommendation()` for the recommendation string |
| `lib/scan/prompts.ts` | `getDraftResponsePrompt()` — the simplified 4-step draft prompt |
| `lib/ai/tools.ts` | `toneAnalyzeTool` + `gmailDraftTool` descriptions |
| `lib/ai/anthropic.ts` | System prompt lines 77-121, especially line 97 (email style principle) |
| `components/insight/InsightDetailPanel.tsx` | Draft generation UI, redraft, copy flow |

## Testing Checklist

Test with 3 email types after each change:
1. **Casual reply** (friend/close colleague) — should match informal tone, include sign-off if user always does
2. **Professional reply** (external contact) — proper capitalization, formal greeting, full sign-off
3. **Quick acknowledgment** (1-2 line reply) — should stay short, not over-elaborate

Verify:
- [ ] Capitalization matches user's pattern
- [ ] Sign-off matches user's pattern (including their name)
- [ ] No extra blank lines between greeting and body (if user doesn't use them)
- [ ] Draft length is appropriate (not verbose)
- [ ] Redraft produces similar quality/length as first draft

## Debugging Approach

1. **Run a draft and inspect the agent's tool calls.** In the browser console or server logs, look at:
   - What tone_analyze returned (samples, styleSignals, recommendation)
   - What the agent passed to gmail_draft (body text)
   - Gap between recommendation and actual draft = where the problem is

2. If the agent ignores the recommendation → make it more imperative in `buildRecommendation()` (execute-tool.ts)

3. If the agent doesn't call tone_analyze at all → check if `getDraftResponsePrompt()` is reaching it correctly
