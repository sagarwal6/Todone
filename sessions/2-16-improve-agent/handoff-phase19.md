# Phase 19 Handoff: Insight Scan Email Selection Quality

## What This Is

The insight scan proactively scans the user's Gmail inbox and surfaces emails that need responses. The problem: it was showing too many low-signal emails (GLG solicitations, newsletters, receipts) and too few real ones. We built a five-layer metadata filter that correctly narrows 173 emails to 15, but the Haiku LLM that formats the results for the UI still only shows ~5-6 of them.

## Current State

### What's Working (metadata filter)

The filter pipeline in `lib/scan/metadata.ts` → `findAwaitingResponse()` applies 5 filters:

1. **NO_ENGAGEMENT**: domain has 3+ inbound, 0 outbound in 90 days → skip all (catches Guidepoint, Substack, NYTimes, Uber, etc.)
2. **BULK_SOLICITATION**: domain has 3+ emails, 3+ senders, 3+ outbound → flag as bulk. Only pass if email has EXISTING_THREAD or GMAIL_PRIMARY (catches GLG solicitations, preserves Akriti personal contact and 1099 tax doc)
3. **AUTOMATED_SKIP**: `isAutomated=true` and no thread → skip (catches verification codes, receipts, welcome emails, billing alerts)
4. **UPDATES_NO_THREAD**: `gmailCategory='updates'` and no thread and not personal domain → skip (catches Google support tickets, shared docs, trial promos, AlphaSights)
5. **Tier + read status**: existing filters for skip/low tier and read medium-tier non-direct emails

Result: **173 → 15 emails pass**. The 15 are the correct set.

### What's NOT Working (Haiku prompt)

The Haiku LLM (Claude Haiku 3.5) receives all 15 emails but only puts ~5-6 in the UI's drafts bundle. The old prompt had a "NEVER suggest drafting replies for: Transaction alerts, Platform emails..." list that contradicted the new "include ALL pre-filtered emails" instruction.

**Fix applied but NOT YET VERIFIED**: Rewrote the prompt in `lib/scan/prompts.ts` to:
- Remove the contradictory "NEVER" list entirely
- Replace with "ALL emails have been pre-filtered. Include EVERY email."
- Only exceptions: calendar invitations and informational-only documents
- Updated both system prompt (lines ~144-155) and user prompt (lines ~230-234)

## Your First Task

**Run `npm run dev -- --webpack`, trigger a scan (click the scan button or reload), and check:**
1. How many emails appear in the UI
2. Whether the W-2 from Google shows up (user specifically wants this)
3. Whether the real-person emails all show: Rani Nelken, Garrick Toubassi, Suman Agarwal, Akriti Gupta, Surendra Agarwal, Michaela Conlon, plus tax prep (myecfo.com), Adobe recruiter, Workday login error

**If Haiku still under-includes**, possible approaches:
- Make the user prompt even more explicit (number each email, say "include items 1-15")
- Switch from free-form LLM selection to structured extraction (Haiku fills in a template per email)
- Pre-build the bundle structure in metadata.ts and have Haiku only add the greeting/valueProposition

**If Haiku works**, proceed to cleanup (see below).

## Files You'll Touch

| File | What's There | What Needs Doing |
|------|-------------|-----------------|
| `lib/scan/metadata.ts` | Five-layer filter, verbose logging | Remove verbose score breakdown (lines 231-245), keep filter logs at reduced verbosity |
| `lib/scan/prompts.ts` | Rewritten Haiku prompt | Verify it works; may need further tuning if Haiku still under-includes |
| `lib/email/scoring.ts` | Email scoring with "Scoring: To list count" debug lines | Remove debug lines |
| `sessions/2-16-improve-agent/plan.md` | Updated Phase 19 section | Update with final results after verification |

## Remaining Noise in the 15 PASSED Emails

Even with 5 filters, a few emails pass that don't need email replies:
- **"Invitation: Shalini / Rani"** (score 39) — calendar invite, respond via calendar
- **"1099-NEC from Gerson Lehrman Group"** (score 24) — informational tax doc
- **"Spreadsheet shared with you"** (score 8) — Google Sheets notification (has thread, so AUTOMATED_SKIP doesn't catch it)
- **"Monthly Competitor report"** (score 8) — automated report (has thread, same reason)

The prompt tells Haiku to skip calendar invitations and informational docs. If that's not enough, could add a metadata filter for `isPlatformMediated` signal or subject pattern matching for "shared with you" / "invitation:" patterns.

## Key Architecture Context

### Scan Pipeline (4 layers)
1. **Gmail search** (`fetchInboxEmails`): `in:inbox newer_than:30d -from:me -category:promotions -category:social` → ~173 emails
2. **Signal scoring** (`scoreEmail` in `lib/email/scoring.ts`): Computes signals (isDirect, isThread, isAutomated, gmailCategory, etc.) and score (HIGH ≥10, MEDIUM ≥3, LOW ≥-2, SKIP <-2)
3. **Metadata filtering** (`findAwaitingResponse` in `lib/scan/metadata.ts`): Applies 5 filters → ~15 emails
4. **LLM classification** (Haiku 3.5 via `lib/scan/prompts.ts`): Formats into bundles for UI (greeting, quickWin, drafts bundle, meetings bundle)

### Key Signals Used by Filters
- `isAutomated`: true if sender matches noreply@, notifications@, has List-Unsubscribe header, etc.
- `isThread` / `EXISTING_THREAD`: true if email is part of a multi-message thread
- `gmailCategory`: 'primary' | 'social' | 'promotions' | 'updates' | 'forums' — from Gmail's own categorization
- `isPersonalDomain`: gmail.com, yahoo.com, etc.
- `isPlatformMediated` / `PLATFORM_MEDIATED`: sent through a platform (Google Docs shares, etc.)

### Engaged Domains
`fetchEngagedDomains()` in `lib/google/gmail.ts` fetches 90 days of sent mail and returns `Map<domain, outbound_count>`. This powers the NO_ENGAGEMENT and BULK_SOLICITATION filters.

## Pre-Commit Checklist

Before committing:
1. [ ] Haiku includes all ~12 response-worthy emails (verified via scan)
2. [ ] Remove verbose score breakdown logging from metadata.ts (lines 231-245)
3. [ ] Remove "Scoring: To list count" debug lines from scoring.ts
4. [ ] `npm run lint` passes (pre-existing: unused import warning in tasks.ts, two errors in unrelated files)
5. [ ] `npm run typecheck` passes (pre-existing: NextAuth route.ts error only)
6. [ ] `npm run build` passes
7. [ ] Update plan.md with final results

## Branch

Working branch: `feature/improve-agent`
All changes are unstaged/uncommitted.
