# Todone Agentic Connectors - Session Plan
**Date:** February 7, 2026
**Last Updated:** February 9, 2026

---

## Session Scope

**This session focuses on:**
1. OAuth sign-in working end-to-end
2. Agent can read Gmail/Calendar to gather context for tasks
3. Agent creates drafts for user review (NEVER sends directly)
4. Agentic loop works like Claude Code - iterative, tool-using, helpful

**Out of scope:**
- Scanning/parsing emails for tasks
- Google Drive access
- Automatic sending (always requires user confirmation)

---

## Critical Safety Rules

- **NEVER send emails** - Only create drafts
- **NEVER create calendar events directly** - Only draft proposals
- **NEVER modify/delete existing data** - Read-only for existing items
- **NEVER access Google Drive** - Out of scope

---

## Phase 1: OAuth & Authentication ✅ COMPLETE

- [x] Verify `.env.local` has all required variables
- [x] Changed to use `TODONE_ANTHROPIC_API_KEY` (to avoid Claude Code env conflict)
- [x] FK constraint migration run in Supabase
- [x] Sign out and sign back in to refresh OAuth tokens
- [x] Verify token stored in Supabase `oauth_tokens` table
- [x] Verify user created in `profiles` table
- [x] **OAuth token auto-refresh** - implemented `getValidAccessToken()` that refreshes expired tokens

---

## Phase 2: Agent Loop Basic Test ✅ COMPLETE

- [x] Create a simple read-only task
- [x] Verify agent loop starts (SSE connection opens)
- [x] Anthropic API key issue fixed (now uses `TODONE_ANTHROPIC_API_KEY`)
- [x] Removed "Use Gmail/Calendar" button (agent auto-starts)
- [x] Fixed duplicate message rendering in UI
- [x] `gmail_search` tool works with OAuth tokens
- [x] **Agent state isolation** - Fixed issue where agent would stop/show wrong task when switching views
- [x] **Background agent execution** - Agents continue running when switching tasks

---

## Phase 3: Web Search ✅ COMPLETE

- [x] Implemented Gemini grounding for web search
- [x] Web search working with Google Search grounding API
- [x] Fallback to Tavily API if available
- [x] Results properly parsed from `groundingMetadata`

**Implementation:** `lib/ai/web.ts` uses Gemini 2.0 Flash with `google_search` tool for grounded web search.

---

## Phase 4: Gmail/Calendar Integration ✅ COMPLETE

- [x] Gmail search (`gmail_search` tool)
- [x] Gmail read (`gmail_read` tool)
- [x] Calendar list (`calendar_list` tool)
- [x] Email drafting (`gmail_draft` tool)
- [x] Calendar event drafting (`calendar_create` tool)
- [x] **Email Signal Scoring** - Pre-scores emails by priority (high/medium/low/skip)
- [x] **Gmail categories** - Uses CATEGORY_PROMOTIONS, CATEGORY_SOCIAL, etc. for scoring

**Email Scoring Signals:**
- isDirect, isCc, isBcc, isMailingList, isAutomated
- isPlatform (linkedin.com, github.com, etc.)
- isPersonalDomain (gmail.com, yahoo.com, etc.)
- Gmail label categories
- isOneToOne, recipientCount, isThread, hasAttachment, isMarketingSubject

---

## Phase 5: Draft Creation & Review ✅ COMPLETE

- [x] Create a task that requires drafting
- [x] Verify draft appears in PendingDrafts UI
- [x] Test "Edit" functionality
- [x] Test "Reject" functionality
- [x] Verify "Confirm" only saves draft, doesn't send

---

## Phase 6: End-to-End Flow ✅ COMPLETE

- [x] Sign out and sign back in
- [x] Create a multi-step task
- [x] Watch agent use multiple tools in sequence
- [x] Verify drafts appear in UI for review

---

## Phase 7: UX Enhancements ✅ COMPLETE (NEW)

- [x] **Quick Reference Card** - Agent extracts key facts (phone, hours, contact, account #)
- [x] **Task Intent Priority** - Agent respects user's stated goal over conflicting email data
- [x] **Background Agent Execution** - Agents continue when switching tasks
- [x] **Working Indicator** - Task list shows spinner for tasks with running agents
- [x] **Summary in Task List** - Quick info shows in both single-pane and two-pane views

---

## Environment Variables Checklist

```bash
# Required - check all are set in .env.local
[x] TODONE_ANTHROPIC_API_KEY   # ✅ Renamed to avoid Claude Code conflict
[x] GEMINI_API_KEY             # For web search grounding
[x] GOOGLE_CLIENT_ID
[x] GOOGLE_CLIENT_SECRET
[x] NEXTAUTH_URL=http://localhost:3000
[x] NEXTAUTH_SECRET
[x] SUPABASE_URL               # ✅ Fixed (.supabase.co not .supabase.com)
[x] SUPABASE_SERVICE_ROLE_KEY  # ✅ Fixed (removed extra chars)
[x] NEXT_PUBLIC_SUPABASE_URL
[x] NEXT_PUBLIC_SUPABASE_ANON_KEY
[ ] TAVILY_API_KEY             # Optional: better web search results
```

---

## Known Issues Found & Fixed

1. ~~**Supabase URL wrong**~~ - Was `.supabase.com`, fixed to `.supabase.co`
2. ~~**Service role key malformed**~~ - Had extra characters, fixed
3. ~~**Anthropic API key conflict**~~ - Claude Code env overriding .env.local, renamed to `TODONE_ANTHROPIC_API_KEY`
4. ~~**Web search not working**~~ - Implemented Gemini grounding properly, parsing `groundingMetadata`
5. ~~**Duplicate messages in UI**~~ - Fixed onComplete callback to not double-add messages
6. ~~**"Use Gmail/Calendar" button**~~ - Removed, agent auto-starts now
7. ~~**Profiles FK constraint**~~ - Fixed with migration
8. ~~**OAuth token expiration**~~ - Implemented auto-refresh with `getValidAccessToken()`
9. ~~**Duplicate 'complete' events**~~ - Removed duplicate emit in route.ts
10. ~~**Agent stops on task switch**~~ - Fixed with global AgentContext
11. ~~**Email prioritization poor**~~ - Added email signal scoring with Gmail categories
12. ~~**Duplicate results showing twice**~~ - Race condition in AgentContext; fixed by using ref instead of state for guard check
13. ~~**Responses too recommendation-heavy**~~ - Updated system prompt to be facts-first, no call scripts
14. ~~**Missing business hours**~~ - Added explicit instruction to always search for hours on calling tasks

---

## API Cost Optimizations ✅ COMPLETE

**Date Implemented:** February 9, 2026

Implemented cost reduction changes to reduce Anthropic API costs by 40-60%:

1. **Prompt Caching Enabled** (`lib/ai/anthropic.ts`)
   - Added `cache_control: { type: 'ephemeral' }` to system prompt
   - First call full price, subsequent iterations 10% of cost
   - Estimated savings: ~40-50% on system prompt tokens

2. **Adaptive max_tokens** (`lib/ai/anthropic.ts`)
   - Iterations 1-2: 1500 tokens (planning phase)
   - Iterations 3+: 2500 tokens (tool use phase)
   - Previously: 4096 for all iterations
   - Estimated savings: ~2000-3000 tokens per task

3. **Reduced Web Content Limit** (`lib/ai/web.ts`)
   - Changed from 8000 to 5000 characters
   - Estimated savings: ~750 tokens per web fetch

4. **Switched to Sonnet 4** (`lib/ai/types.ts`)
   - Changed from `claude-opus-4-20250514` to `claude-sonnet-4-20250514`
   - 5x cost reduction (~$2.25 vs $11.25 per 150K token task)
   - Similar quality for agentic tasks

5. **Compressed Tool Descriptions** (`lib/ai/tools.ts`)
   - Reduced verbose descriptions to ~100 chars each
   - Estimated savings: ~500 tokens per task

**Total Estimated Savings:** 40-60% per task

---

## Debug Endpoint

A debug endpoint is available at `/api/debug/oauth` to check:
- Whether your profile exists in Supabase
- Whether OAuth tokens are stored
- Whether tokens are expired

Visit http://localhost:3000/api/debug/oauth after signing in.

---

## Success Criteria ✅ ALL MET

By end of session:
- [x] OAuth flow works: sign in → token stored → session persists
- [x] Anthropic API key works
- [x] Web search works (Gemini grounding)
- [x] Agent reads Gmail successfully
- [x] Agent reads Calendar successfully
- [x] Agent creates drafts (not sends)
- [x] Drafts appear in UI for review
- [x] No emails actually sent, no events actually created

---

## New Files Created This Session

- `lib/email/types.ts` - Email scoring types
- `lib/email/scoring.ts` - Email priority scoring logic
- `components/QuickReferenceCard.tsx` - Key facts display card
- `contexts/AgentContext.tsx` - Global agent state management

---

## Architecture Improvements

1. **Email Signal Scoring** - Pre-filters emails before LLM, reduces noise
2. **Quick Info Extraction** - Agent outputs structured JSON for key facts
3. **Global Agent Context** - Agents run independently of UI state
4. **Task Intent Priority** - System prompt respects user's stated goal
5. **Facts-First Responses** - No call scripts or hand-holding; trust user competence
6. **Business Hours Priority** - Always search for hours on calling tasks

---

## Phase 8: Read-Only API Migration ✅ COMPLETE (February 10, 2026)

**Motivation:** Reduce OAuth permission requests to minimize user friction and security concerns.

### Changes Made

1. **OAuth Scopes Reduced** (`app/api/auth/[...nextauth]/route.ts`)
   - Removed: `gmail.send`, `gmail.compose`, `calendar`, `calendar.events`
   - Kept: `gmail.readonly`, `calendar.readonly`, `contacts.readonly`

2. **Gmail Compose URLs** (`lib/utils/gmail-compose.ts`)
   - New utility to generate Gmail compose URLs with pre-filled content
   - Supports web and mobile (Gmail app deep links)
   - Also supports Google Calendar event creation URLs

3. **Updated Draft Cards**
   - `EmailDraftCard.tsx`: "Send" → "Open in Gmail"
   - `CalendarDraftCard.tsx`: "Create Event" → "Open in Calendar"
   - User clicks to open Gmail/Calendar with pre-filled content, then sends/creates manually

4. **Removed Write Functions**
   - Removed: `sendEmail`, `createDraft` from `lib/google/gmail.ts`
   - Removed: `createEvent`, `updateEvent`, `deleteEvent` from `lib/google/calendar.ts`
   - Updated exports in `lib/google/index.ts`

### Scopes to Remove from Google Cloud Console

Remove these from your OAuth consent screen:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

Keep these:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`
- `openid`, `userinfo.email`, `userinfo.profile`

### User Flow Changes

**Before:** AI creates draft via API → User confirms → Draft appears in Gmail
**After:** AI prepares draft content → User clicks "Open in Gmail" → Gmail opens with pre-filled compose → User sends manually

**Trade-offs:**
- ✅ Fewer permissions = less scary OAuth consent
- ✅ User has full control (must manually click Send in Gmail)
- ❌ Can't thread replies properly (Gmail compose URL limitation)
- ❌ Long emails may be truncated (URL length limits ~2000 chars)
