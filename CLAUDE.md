# Todone

AI-powered task assistant that helps users get things done by connecting to their Google Workspace (Gmail, Calendar, Contacts). Users add tasks; Todone researches and executes what it can, always requiring human confirmation for actions.

## Critical Safety Rules

### Google API Access (Read-Only Only)
- `gmail.readonly`, `calendar.readonly`, `contacts.readonly` — no write scopes
- Scopes defined in `lib/google/auth.ts` `GOOGLE_SCOPES` (single source of truth, imported by NextAuth)
- **New emails**: AI prepares draft, user clicks "Compose in Gmail" to open pre-filled compose
- **Email replies**: AI prepares suggested reply text, user copies it and clicks "Open Thread in Gmail" to paste and send (Gmail compose URLs can't deep-link into a reply with pre-filled content)
- **Calendar events**: AI prepares details, user clicks "Create in Calendar" to open Google Calendar
- All write actions are URL-based redirects, never API writes
- Never add `gmail.compose`, `gmail.send`, or `calendar.events` scopes without explicit approval

### Human-in-the-Loop Required
All actions (send email, create event) require explicit user confirmation in Google's native UI.

## Tech Stack

- **Framework**: Next.js 16 + React 18 + TypeScript (strict)
- **Styling**: Tailwind CSS + MD3 color tokens (CSS variables in `globals.css`)
- **AI**: Gemini 2.0 Flash (research), Claude Sonnet 4 (agentic tasks), Claude Haiku 3.5 (insight scan)
- **Auth**: NextAuth + Google OAuth
- **Database**: Supabase (Postgres + RLS) for all data; localStorage as cache only

## Key Architecture

### Agentic Loop (`/lib/ai/anthropic.ts`)
- Tools: `gmail_search`, `gmail_read`, `gmail_draft`, `calendar_list`, `calendar_create`, `contacts_search`, `contacts_analyze`, `web_search`, `web_fetch`
- Read-only tools execute in parallel; write tools (drafts) run sequentially after
- SSE streaming for progress; saga-style persistence in `agent_steps` table
- Token budget: 150k per task; prompt caching enabled
- Per-call cost logging to `logs/ai-costs.jsonl`
- System prompt uses principles (not prescriptive rules) — behavioral guidance lives in tool descriptions

### Key Directories
- `/lib/ai/` - Agentic loop, tools, execution
- `/lib/google/` - Gmail, Calendar, Contacts API wrappers
- `/lib/scan/` - Insight scan (proactive inbox/calendar scanning)
- `/components/insight/` - Scan UI components
- `/contexts/AgentContext.tsx` - Global agent state (runs in background)

### Email Scoring (`/lib/email/scoring.ts`)
Signal-based priority scoring shared by agent and insight scan. Agent gets HIGH only; scan gets HIGH + MEDIUM.
- Don't add domains to blocklists — improve generic heuristics in `scoring-utils.ts` instead
- Triage broadening is server-side in `execute-tool.ts` — agent doesn't need to do multiple searches

### Insight Scan
Scans inbox/calendar for actionable items. Emails pre-filtered by scoring before LLM (Haiku 3.5). Actions: `draft_response`, `meeting_prep`, `follow_up`.

### Contact Analysis (`/lib/email/contacts-analysis.ts`)
`contacts_analyze` tool scans 1 year of email + calendar to build relationship profiles (frequency, recency, direction, meeting patterns). Used for disambiguation and people-related tasks.

## Code Conventions

- **TypeScript**: Strict mode, types in `/lib/types.ts`
- **Components**: Functional + hooks only, no class components
- **Styling**: Tailwind only, use existing MD3 tokens
- **UI**: Use `/components/ui` before creating new components
- **State**: React hooks + Supabase (localStorage as cache), no Redux
- **Streaming**: SSE, not WebSockets

## Development Guidelines

### Only Build What's Requested
**Do NOT add features that haven't been explicitly requested.** No "nice to have" UI, no preemptive error handling, no extra config options. When in doubt, ask.

### Think It Through, Implement It Fully
No half-done work. Every feature must be:
1. Fully thought out (states, edge cases, interactions)
2. Completely implemented (no TODOs, no placeholders)
3. Actually working (compiles, types check, works)

## Security

- OAuth tokens encrypted at rest (`ENCRYPTION_SECRET`)
- Never store full email/event content, only summaries
- Row Level Security on all Supabase tables
- Audit logging via `audit_log` table

## Design Principles

- **Visual**: Google Inbox / MD3 inspired, clean, minimal clutter
- **UX**: Content over chrome, progressive disclosure, optimistic UI, mobile-first
- **Agent personality**: Elite executive assistant, facts first, no hand-holding. Keep working until confident — never fabricate.
- **Data sources**: When user says "check my emails", MUST search emails - never guess

## Git Workflow

### Branching
- Work on feature branches: `feature/<name>`, `fix/<name>`
- Commit by phase/logical unit — not giant monolithic commits
- Merge to `master` via PR once the feature is complete and tested

### Pre-Commit Checks
Run all three before every commit — all must pass:
```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm run build        # Production build
```

### Commit Messages
- Short, descriptive subject line (imperative mood)
- No "Co-Authored-By" lines
- No test plans or verification steps in commit messages
- Body (optional) explains *why*, not *what*

### Planning
All plans (in `sessions/`) must include a **Testing** section per phase with:
- Feature-specific verification steps (does the feature work as intended?)
- Manual verification for UI/UX changes
- Regression checks for existing functionality
- Note: lint, typecheck, and build are already enforced before every commit (see Pre-Commit Checks) — don't duplicate them in test plans

## Commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run build        # Production build
npm run lint         # Linter
npm run typecheck    # TypeScript type checking
```

## Environment Variables

```bash
GEMINI_API_KEY              # Gemini for research
TODONE_ANTHROPIC_API_KEY    # Claude for agentic (NOT ANTHROPIC_API_KEY)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
NEXTAUTH_URL / NEXTAUTH_SECRET
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
ENCRYPTION_SECRET
```

## Pre-Production Checklist

See `sessions/pre-production-checklist.md` for items that must be completed before deploying to production (Google Cloud setup, code cleanup, deployment config).

## Known Gotchas

### Environment Variables
- Use `TODONE_ANTHROPIC_API_KEY` not `ANTHROPIC_API_KEY` - Claude Code overrides the latter
- Supabase URL ends in `.supabase.co` not `.supabase.com`

### Agent State Management
- Use refs for synchronous guards (not state) to prevent race conditions
- `AgentContext` runs globally - agents continue in background when switching tasks

### React Callbacks
- Avoid state in `useCallback` deps that changes frequently - use refs instead

### Agent Contact Disambiguation
- System prompt principles guide disambiguation — don't hardcode "calendar always wins" or "email always wins"
- The right signal depends on context: imminent meeting, recent email thread, topic match
- Agent must NEVER fabricate email addresses from names — only use verified addresses from contacts, email history, or calendar attendee data
- `EmailDraftCard` has two modes: compose (no threadId) vs reply (has threadId) — see `components/EmailDraftCard.tsx`

### Security / Logging
- Never log API keys, tokens (access/refresh), or their prefixes
- Never log user email addresses, email subjects, sender names, or email content
- Never put real contact names, phone numbers, or email addresses in code (prompts, examples, tests) — use generic placeholders
- Operational logs (counts, tiers, scores, status booleans) are fine
- No debug/test API endpoints in production — all routes must check authentication
- Debug endpoints were removed in the 2/15 security review — do not recreate them

### Google API & Privacy Compliance
Code MUST match what the privacy policy (`/app/privacy/page.tsx`) and terms (`/app/terms/page.tsx`) promise:
- **Read-only only** — no Google API write calls (no POST/PUT to Gmail, Calendar, Contacts)
- **No full email bodies stored in DB** — only metadata (sender, subject, date) and task summaries
- **PII redaction before AI** — all email content passes through `redactPII()` in `execute-tool.ts` before reaching Claude/Gemini
- **Tokens encrypted at rest** — always call `encrypt()` before storing, `decrypt()` when reading
- **Token revocation on sign-out** — revoke with Google AND delete from DB
- **No analytics/tracking/ad SDKs** — no Google Analytics, Mixpanel, Segment, etc.
- **No AI model training** — use Anthropic zero-retention API; Gemini paid API (no training)
- **Limited Use compliance** — Google user data only for user-facing features, never sold/shared
- **COPPA** — service is for users 13+; no features directed at children
- **Account deletion** — users can delete all their data (Phase 6: DELETE /api/user)

### PWA / Mobile
- iOS standalone PWA opens Safari for OAuth — session cookie is shared back via same origin. Post-OAuth landing page at `/auth/complete` handles the redirect.
- Web Share Target API is Chromium-only — does not work on iOS Safari
- `@dnd-kit` `PointerSensor` fires on touch devices — use `TouchSensor` only on mobile, `PointerSensor` only on desktop
- Voice capture (Web Speech API): iOS Safari may fire `onend` before `isFinal` results — use triple-fallback transcript recovery
