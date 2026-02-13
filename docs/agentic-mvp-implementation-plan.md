# Todone Agentic MVP - Implementation Plan

## Summary

Build an agentic to-do app where users write tasks, Claude executes them (research, draft emails, schedule meetings), and users confirm with one tap. Web-first MVP, then React Native iOS app.

**Key Architecture Decision:** ONE agentic loop with ALL tools. No upfront task classification. Claude decides what tools to use based on the task. UI adapts to what Claude produces:
- If Claude drafts an email → show email confirmation UI
- If Claude drafts a calendar event → show calendar confirmation UI
- If Claude does research → show research results
- If Claude does nothing (simple task) → just show the task

---

## Current State

**What exists:**
- Next.js 16 + React 18 + TypeScript + Tailwind CSS
- Gemini 2.0 Flash with Google Search (working)
- NextAuth + Google OAuth (stores tokens in Supabase `oauth_tokens` table)
- Supabase client scaffolded but unused
- localStorage-based persistence (single-user)
- Polished Material Design 3 / Inbox-style UI

**What needs to be built:**
- Supabase database schema + migration
- Claude (Anthropic) integration with tool calling
- Single agentic loop with all tools
- Google APIs (Gmail, Calendar, Contacts)
- Write action confirmation UI
- Real-time progress streaming

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | NextAuth (keep existing) |
| Database | Supabase Postgres |
| AI Brain | Claude Sonnet (Anthropic API) |
| AI Search | Gemini 2.0 Flash (keep existing) |
| Google APIs | googleapis package |
| Mobile (later) | React Native |

---

## Implementation Phases

### Phase 1: Database Foundation
1. Create Supabase schema:
   - `profiles` table (user info, encrypted Google refresh token)
   - `tasks` table (with user_id, agent fields, draft fields)
   - `task_messages` table (chat history)
2. Set up RLS policies (users only see their own data)
3. Create `lib/supabase/client.ts` (browser) and `lib/supabase/server.ts`
4. Migrate `hooks/useTasks.ts` from localStorage → Supabase
5. Wire auth: protect routes, add user context to queries

### Phase 2: Google API Integration
1. Add `googleapis` package
2. Create `lib/google/auth.ts` - token refresh using stored refresh token
3. Create `lib/google/gmail.ts`:
   - `searchEmails(query)` - find emails
   - `readThread(threadId)` - read full thread
   - `sendEmail(draft)` - send (write action)
4. Create `lib/google/calendar.ts`:
   - `getEvents(timeMin, timeMax)` - check availability
   - `createEvent(draft)` - create event (write action)
5. Create `lib/google/contacts.ts`:
   - `searchContacts(query)` - find people
6. Request additional Google scopes when user first needs them (progressive upgrade)

### Phase 3: Claude + Agentic Loop
1. Add `@anthropic-ai/sdk` package
2. Create `lib/ai/anthropic.ts` - Claude client
3. Create `lib/ai/tools.ts` - tool definitions:
   - `web_search` (uses Gemini)
   - `gmail_search`, `gmail_read`
   - `calendar_read`, `contacts_search`
   - `draft_email`, `draft_calendar_event`
4. Create `lib/ai/execute-tool.ts` - dispatches tool calls to implementations
5. Create `app/api/tasks/[taskId]/run/route.ts`:
   - Takes task content
   - Runs agentic loop (Claude plans → calls tools → synthesizes)
   - Stores results: `agent_progress`, `agent_result`, `email_draft`, `calendar_draft`
   - Updates task status: `added` → `working` → `ready`
6. Max 10 iterations, error recovery

### Phase 4: Confirmation + Write Actions
1. Create `app/api/tasks/[taskId]/confirm/route.ts`:
   - If `email_draft` exists → send via Gmail API
   - If `calendar_draft` exists → create via Calendar API
   - Update task status to `done`
2. Create `components/EmailDraftCard.tsx` - shows draft with edit + confirm
3. Create `components/CalendarDraftCard.tsx` - shows invite with time picker + confirm
4. Update `components/ConversationPanel.tsx` to render appropriate confirmation UI based on task state

### Phase 5: Real-time Progress
1. Create `hooks/useTaskProgress.ts` - subscribes to Supabase realtime
2. Create `components/AgentProgress.tsx` - shows streaming status messages
3. Update task UI to show progress while `status === 'working'`

### Phase 6: Polish + Edge Cases
1. Handle missing Google permissions gracefully (prompt to upgrade)
2. Handle tool failures (let Claude retry or work around)
3. Handle empty results (no emails found, no availability)
4. Simple tasks ("call mom") - Claude returns quickly with no actions
5. Error states and retry UI

### Phase 7 (Later): React Native iOS
1. Set up React Native project with shared TypeScript types
2. Reuse API layer (same endpoints)
3. Build native UI components
4. Handle OAuth flow on mobile
5. App Store submission

---

## Files to Create

```
lib/
├── supabase/
│   ├── client.ts          # Browser Supabase client
│   └── server.ts          # Server Supabase client
├── ai/
│   ├── anthropic.ts       # Claude client
│   ├── tools.ts           # Tool definitions for Claude
│   └── execute-tool.ts    # Tool execution dispatcher
├── google/
│   ├── auth.ts            # Token refresh utility
│   ├── gmail.ts           # Gmail API functions
│   ├── calendar.ts        # Calendar API functions
│   └── contacts.ts        # Contacts API functions
└── utils/
    └── encryption.ts      # Encrypt/decrypt tokens

app/api/tasks/
├── route.ts               # CRUD tasks (update existing)
└── [taskId]/
    ├── run/route.ts       # Agentic loop endpoint
    └── confirm/route.ts   # Execute write action

components/
├── AgentProgress.tsx      # Streaming progress display
├── EmailDraftCard.tsx     # Email draft + confirm UI
└── CalendarDraftCard.tsx  # Calendar draft + confirm UI

hooks/
└── useTaskProgress.ts     # Real-time progress subscription

supabase/migrations/
└── 001_initial_schema.sql # Database schema
```

## Files to Modify

- `lib/types.ts` - Add agentic fields to Task type
- `hooks/useTasks.ts` - Supabase instead of localStorage
- `components/ConversationPanel.tsx` - Render confirmation UI based on draft type
- `components/TaskCard.tsx` - Show agentic states (working, ready)
- `package.json` - Add new dependencies

---

## Database Schema (Supabase)

```sql
-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users primary key,
  email text,
  display_name text,
  google_refresh_token text,  -- encrypted
  google_scopes text[],
  created_at timestamptz default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles not null,
  content text not null,
  status text default 'added',  -- added, working, ready, done, failed
  position integer,
  pinned boolean default false,

  -- Agent state
  agent_progress jsonb[] default '{}',
  agent_result jsonb,

  -- Drafts (Claude produces these)
  email_draft jsonb,      -- {to, subject, body, thread_id}
  calendar_draft jsonb,   -- {title, start, end, attendees}

  -- After confirmation
  email_sent_id text,
  calendar_event_id text,

  -- Research (existing)
  research jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages per task
create table task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks on delete cascade,
  role text,  -- user, assistant
  content text,
  created_at timestamptz default now()
);

-- RLS: users only see their own data
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table task_messages enable row level security;

create policy "own_profile" on profiles for all using (auth.uid() = id);
create policy "own_tasks" on tasks for all using (auth.uid() = user_id);
create policy "own_messages" on task_messages for all using (
  auth.uid() = (select user_id from tasks where id = task_id)
);
```

---

## Tool Definitions for Claude

```typescript
const tools = [
  {
    name: 'web_search',
    description: 'Search the web. Use for facts, prices, availability, current events.',
    input_schema: { query: string }
  },
  {
    name: 'gmail_search',
    description: 'Search user\'s Gmail. Returns list of matching emails.',
    input_schema: { query: string, max_results?: number }
  },
  {
    name: 'gmail_read',
    description: 'Read a specific email thread.',
    input_schema: { thread_id: string }
  },
  {
    name: 'calendar_read',
    description: 'Get calendar events in a time range.',
    input_schema: { time_min: string, time_max: string }
  },
  {
    name: 'contacts_search',
    description: 'Search user\'s Google Contacts.',
    input_schema: { query: string }
  },
  {
    name: 'draft_email',
    description: 'Create email draft for user review. Does NOT send.',
    input_schema: { to: string, subject: string, body: string, thread_id?: string }
  },
  {
    name: 'draft_calendar_event',
    description: 'Create calendar event draft for user review. Does NOT create.',
    input_schema: { title: string, start: string, end: string, attendees?: string[] }
  }
];
```

---

## Verification Plan

1. **Auth**: Sign in → tokens stored → can call Google APIs
2. **Agentic research**: "Find flights to Tokyo" → Claude uses web_search → shows synthesized options
3. **Email flow**: "Reply to Bob about the proposal" → Claude searches Gmail → reads thread → drafts reply → user confirms → email sent
4. **Calendar flow**: "Schedule call with Sarah next week" → Claude finds Sarah in contacts → checks calendar → drafts invite → user confirms → invite created
5. **Simple task**: "Buy groceries" → Claude returns quickly → just a task on the list
6. **Progress streaming**: UI shows real-time status during agentic execution
7. **Error handling**: Missing permissions → prompt to grant; API failure → graceful error message
