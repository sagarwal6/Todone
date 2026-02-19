# New Session: Draft Quality & Redraft Consistency

**Branch:** `feature/improve-agent`
**Start here:** `sessions/2-18-draft-quality/issues.md`
**Full plan:** `sessions/2-16-improve-agent/plan.md` (Phase 17)

## Context

Todone is an AI task assistant connected to Google Workspace. The insight scan finds actionable emails and lets users draft replies. The drafting flow works end-to-end (UI, agent progress, copy, open in Gmail), but **draft quality doesn't match the user's writing style**.

## What's been built

- **`tone_analyze` tool** — analyzes user's sent emails, returns style signals (greeting, sign-off, capitalization, spacing, formality) + email samples + recommendation string
- **Simplified draft prompt** — `getDraftResponsePrompt()` cut from 110 lines to 40. Now 4 steps: (1) call tone_analyze, (2) read email, (3) check calendar if scheduling, (4) create reply
- **Cleaned `gmail_draft` description** — removed style prescriptions, defers to tone_analyze
- **System prompt aligned** — tells agent to call tone_analyze before every draft

## What needs to happen

### 1. Manual testing (FIRST PRIORITY)
Run 3 draft types through the insight scan and evaluate quality:
- Casual reply (friend/colleague)
- Professional reply (external contact)
- Quick acknowledgment (1-2 lines)

Check: capitalization, sign-off with user's name, spacing, length. See `issues.md` testing checklist.

### 2. If agent ignores tone_analyze recommendation
The recommendation string in `executeToneAnalyze()` (`lib/ai/execute-tool.ts`, look for `buildRecommendation`) is descriptive. It may need to be imperative. Example change:
- Current: "User uses proper capitalization. Signs off with 'Thanks, Shalini'"
- Better: "YOU MUST capitalize sentences. YOU MUST end with:\nThanks,\nShalini"

### 3. If agent doesn't call tone_analyze at all
Check that `getDraftResponsePrompt()` in `lib/scan/prompts.ts` Step 1 is reaching the agent. The prompt flows: `getDraftResponsePrompt()` → `getActionExecutionPrompt()` → POST to execute route → agent loop as `customPrompt`.

### 4. Redraft consistency (Issue 2 — still open)
First draft is often short and good; redraft is verbose and different. The agent runs fresh each time. Options:
- Cache tone_analyze result from first draft, inject into redraft prompt
- Add length/approach constraint to redraft prompt
- Accept some non-determinism

## Key files

| File | What to look at |
|------|----------------|
| `lib/ai/execute-tool.ts` | `executeToneAnalyze()` and `buildRecommendation()` — is the recommendation clear enough? |
| `lib/scan/prompts.ts` | `getDraftResponsePrompt()` — the 4-step prompt. Is it being followed? |
| `lib/ai/tools.ts` | `gmailDraftTool` description — does it reinforce tone_analyze? |
| `lib/ai/anthropic.ts` | System prompt line 97 — email style principle |
| `components/insight/InsightDetailPanel.tsx` | Draft UI, redraft flow, `handleGenerateDraft` |
| `sessions/2-18-draft-quality/issues.md` | Full diagnosis and testing checklist |

## How to test

1. `npm run dev` → sign in → click the scan button (top right)
2. Wait for scan to complete → click an email action
3. Click "Draft for me" (optionally add instructions)
4. Watch agent progress → draft appears in textarea
5. Evaluate draft quality against the checklist
6. Try "Redraft" and compare

## Pre-commit checks

```bash
npm run lint && npm run typecheck && npm run build
```

Known pre-existing errors to ignore:
- `authOptions` TS2344 in `.next/dev/types/` route file
- `<a>` vs `<Link>` warning in one component
