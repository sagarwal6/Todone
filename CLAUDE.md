# Todone

AI-powered task assistant that helps users get things done by connecting to their Google Workspace (Gmail, Calendar, Contacts). Users add tasks; Todone researches and executes what it can, always requiring human confirmation for actions.

## Critical Safety Rules

### Google API Access (Read-Only Only)
- `gmail.readonly`, `calendar.readonly`, `contacts.readonly` - no write scopes
- **Email replies**: AI prepares draft, user clicks "Reply in Gmail" to open thread and reply there
- **Calendar events**: AI prepares details, user clicks "Create in Calendar" to open Google Calendar
- All write actions are URL-based redirects, never API writes

### Human-in-the-Loop Required
All actions (send email, create event) require explicit user confirmation in Google's native UI.

## Tech Stack

- **Framework**: Next.js 16 + React 18 + TypeScript (strict)
- **Styling**: Tailwind CSS + MD3 color tokens (CSS variables in `globals.css`)
- **AI**: Gemini 2.0 Flash (research), Claude Sonnet 4 (agentic tasks)
- **Auth**: NextAuth + Google OAuth
- **Database**: Supabase (Postgres + RLS) for all data; localStorage as cache only

## Key Architecture

### Agentic Loop (`/lib/ai/anthropic.ts`)
- Tools: `gmail_search`, `gmail_read`, `gmail_draft`, `calendar_list`, `calendar_create`, `contacts_search`, `web_search`
- SSE streaming for progress; saga-style persistence in `agent_steps` table
- Token budget: 150k per task; prompt caching enabled

### Key Directories
- `/lib/ai/` - Agentic loop, tools, execution
- `/lib/google/` - Gmail, Calendar, Contacts API wrappers
- `/lib/scan/` - Insight scan (proactive inbox/calendar scanning)
- `/components/insight/` - Scan UI components
- `/contexts/AgentContext.tsx` - Global agent state (runs in background)

### Insight Scan
Scans inbox/calendar for actionable items. Emails pre-filtered by scoring before LLM. Actions: `draft_response`, `meeting_prep`, `follow_up`.

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
- **Agent personality**: Elite executive assistant, facts first, no hand-holding
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

## Known Gotchas

### Environment Variables
- Use `TODONE_ANTHROPIC_API_KEY` not `ANTHROPIC_API_KEY` - Claude Code overrides the latter
- Supabase URL ends in `.supabase.co` not `.supabase.com`

### Agent State Management
- Use refs for synchronous guards (not state) to prevent race conditions
- `AgentContext` runs globally - agents continue in background when switching tasks

### React Callbacks
- Avoid state in `useCallback` deps that changes frequently - use refs instead
