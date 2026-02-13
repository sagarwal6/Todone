-- Todone Agentic MVP Database Schema
-- Migration: 001_initial_schema.sql
-- Created: 2026-02-05
--
-- This schema implements the corrected agentic task management database
-- with proper defaults, constraints, indexes, and audit trails.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Task status enum for type safety
create type task_status as enum (
  'added',      -- Newly created, not yet processed
  'working',    -- Agent is actively working on this task
  'ready',      -- Agent completed work, awaiting user review
  'done',       -- User confirmed/completed the task
  'failed'      -- Agent failed to complete the task
);

-- Agent action types that require confirmation
create type agent_action_type as enum (
  'email_draft',
  'calendar_event',
  'email_send',
  'calendar_create'
);

-- User feedback on drafts
create type user_feedback_type as enum (
  'confirm',
  'reject',
  'edit'
);

-- Agent step status for saga-style tracking
create type agent_step_status as enum (
  'pending',
  'running',
  'completed',
  'failed'
);

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table profiles enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- ============================================================================
-- OAUTH TOKENS TABLE (with rotation support)
-- ============================================================================

create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  provider text not null, -- 'google'
  access_token text not null,
  refresh_token text,
  access_token_expires_at timestamptz not null,
  -- Token rotation tracking
  refresh_token_issued_at timestamptz default now(),
  token_rotation_count integer default 0,
  -- Scopes granted
  scopes text[] default array[]::text[],
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  unique(user_id, provider)
);

-- Enable RLS
alter table oauth_tokens enable row level security;

-- OAuth tokens policies
create policy "Users can view own tokens"
  on oauth_tokens for select
  using (auth.uid() = user_id);

create policy "Users can update own tokens"
  on oauth_tokens for update
  using (auth.uid() = user_id);

-- ============================================================================
-- TASKS TABLE
-- ============================================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,

  -- Core task data
  title text not null,
  status task_status default 'added' not null,
  "order" integer default 0,

  -- Research data from Gemini (existing functionality)
  research jsonb,

  -- Agent progress tracking (FIXED: proper empty array default)
  agent_progress jsonb[] default array[]::jsonb[],

  -- Agent-generated drafts that need confirmation
  pending_drafts jsonb[] default array[]::jsonb[],
  -- Schema: { type: agent_action_type, data: object, created_at: timestamp }

  -- Human-in-the-loop audit trail
  confirmed_at timestamptz,
  confirmed_by uuid references profiles(id),
  original_draft jsonb,   -- What Claude produced
  final_draft jsonb,      -- What user actually confirmed (may have edits)

  -- Draft versioning
  draft_version integer default 1,
  draft_history jsonb[] default array[]::jsonb[],
  user_feedback user_feedback_type,
  user_feedback_text text,

  -- Cancellation support
  cancelled_at timestamptz,
  cancellation_reason text,

  -- Agent failure tracking
  failure_state jsonb,
  -- Schema: { attempted: string[], succeeded: string[], failed: {tool, error}[], reason: string, partial_result?: object }

  -- Token budget tracking
  total_tokens_used integer default 0,

  -- Existing fields from current schema
  completed_steps text[] default array[]::text[],
  is_pinned boolean default false,
  chat_messages jsonb[] default array[]::jsonb[],

  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  completed_at timestamptz
);

-- Enable RLS
alter table tasks enable row level security;

-- Task policies
create policy "Users can view own tasks"
  on tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tasks"
  on tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete own tasks"
  on tasks for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- AGENT STEPS TABLE (Saga-style state persistence)
-- ============================================================================

create table agent_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,

  -- Step execution details
  step_number integer not null,
  tool_name text not null,
  tool_input jsonb not null,
  tool_output jsonb,
  error_message text,
  is_retriable boolean default true,

  -- Status tracking
  status agent_step_status default 'pending' not null,

  -- Timing
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,

  -- Token tracking per step
  input_tokens integer default 0,
  output_tokens integer default 0,

  created_at timestamptz default now() not null
);

-- Enable RLS
alter table agent_steps enable row level security;

-- Agent steps policies (inherit from parent task)
create policy "Users can view own task steps"
  on agent_steps for select
  using (
    exists (
      select 1 from tasks t
      where t.id = agent_steps.task_id
      and t.user_id = auth.uid()
    )
  );

create policy "Users can insert own task steps"
  on agent_steps for insert
  with check (
    exists (
      select 1 from tasks t
      where t.id = agent_steps.task_id
      and t.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TASK MESSAGES TABLE (Chat history)
-- ============================================================================

create table task_messages (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,

  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,

  -- Optional metadata
  metadata jsonb,

  created_at timestamptz default now() not null
);

-- Enable RLS
alter table task_messages enable row level security;

-- Task messages policies
create policy "Users can view own task messages"
  on task_messages for select
  using (
    exists (
      select 1 from tasks t
      where t.id = task_messages.task_id
      and t.user_id = auth.uid()
    )
  );

create policy "Users can insert own task messages"
  on task_messages for insert
  with check (
    exists (
      select 1 from tasks t
      where t.id = task_messages.task_id
      and t.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RATE LIMITS TABLE
-- ============================================================================

create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  endpoint text not null, -- 'agentic', 'research', etc.

  -- Rolling window tracking
  minute_count integer default 0,
  minute_reset_at timestamptz default now(),
  hour_count integer default 0,
  hour_reset_at timestamptz default now(),
  day_count integer default 0,
  day_reset_at timestamptz default now(),

  updated_at timestamptz default now() not null,

  unique(user_id, endpoint)
);

-- Enable RLS
alter table rate_limits enable row level security;

create policy "Users can view own rate limits"
  on rate_limits for select
  using (auth.uid() = user_id);

create policy "Users can update own rate limits"
  on rate_limits for update
  using (auth.uid() = user_id);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,

  action text not null, -- 'agent_started', 'tool_called', 'draft_created', 'draft_confirmed', 'write_executed'
  details jsonb,

  -- IP and user agent for security
  ip_address inet,
  user_agent text,

  created_at timestamptz default now() not null
);

-- Audit log is admin-only, no RLS for users
alter table audit_log enable row level security;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Tasks indexes (critical for query performance)
create index idx_tasks_user_id on tasks(user_id);
create index idx_tasks_user_status on tasks(user_id, status);
create index idx_tasks_user_order on tasks(user_id, "order");
create index idx_tasks_created_at on tasks(created_at desc);

-- Agent steps indexes
create index idx_agent_steps_task_id on agent_steps(task_id);
create index idx_agent_steps_task_status on agent_steps(task_id, status);

-- Task messages index
create index idx_task_messages_task_id on task_messages(task_id);

-- Rate limits index
create index idx_rate_limits_user_endpoint on rate_limits(user_id, endpoint);

-- Audit log indexes
create index idx_audit_log_user_id on audit_log(user_id);
create index idx_audit_log_task_id on audit_log(task_id);
create index idx_audit_log_created_at on audit_log(created_at desc);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to relevant tables
create trigger update_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();

create trigger update_oauth_tokens_updated_at
  before update on oauth_tokens
  for each row execute function update_updated_at_column();

create trigger update_tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at_column();

create trigger update_rate_limits_updated_at
  before update on rate_limits
  for each row execute function update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check and update rate limits
create or replace function check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_per_minute integer default 5,
  p_max_per_hour integer default 30,
  p_max_per_day integer default 100
)
returns table(allowed boolean, limit_type text, reset_at timestamptz) as $$
declare
  v_record rate_limits%rowtype;
  v_now timestamptz := now();
begin
  -- Get or create rate limit record
  insert into rate_limits (user_id, endpoint)
  values (p_user_id, p_endpoint)
  on conflict (user_id, endpoint) do nothing;

  select * into v_record
  from rate_limits
  where user_id = p_user_id and endpoint = p_endpoint
  for update;

  -- Reset counters if windows have passed
  if v_record.minute_reset_at < v_now - interval '1 minute' then
    v_record.minute_count := 0;
    v_record.minute_reset_at := v_now;
  end if;

  if v_record.hour_reset_at < v_now - interval '1 hour' then
    v_record.hour_count := 0;
    v_record.hour_reset_at := v_now;
  end if;

  if v_record.day_reset_at < v_now - interval '1 day' then
    v_record.day_count := 0;
    v_record.day_reset_at := v_now;
  end if;

  -- Check limits
  if v_record.minute_count >= p_max_per_minute then
    return query select false, 'minute'::text, v_record.minute_reset_at + interval '1 minute';
    return;
  end if;

  if v_record.hour_count >= p_max_per_hour then
    return query select false, 'hour'::text, v_record.hour_reset_at + interval '1 hour';
    return;
  end if;

  if v_record.day_count >= p_max_per_day then
    return query select false, 'day'::text, v_record.day_reset_at + interval '1 day';
    return;
  end if;

  -- Increment counters
  update rate_limits
  set
    minute_count = v_record.minute_count + 1,
    minute_reset_at = v_record.minute_reset_at,
    hour_count = v_record.hour_count + 1,
    hour_reset_at = v_record.hour_reset_at,
    day_count = v_record.day_count + 1,
    day_reset_at = v_record.day_reset_at
  where user_id = p_user_id and endpoint = p_endpoint;

  return query select true, null::text, null::timestamptz;
end;
$$ language plpgsql;

-- Function to log audit events
create or replace function log_audit_event(
  p_user_id uuid,
  p_task_id uuid,
  p_action text,
  p_details jsonb default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into audit_log (user_id, task_id, action, details, ip_address, user_agent)
  values (p_user_id, p_task_id, p_action, p_details, p_ip_address, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql;

-- Function to append progress event to task (for SSE + Realtime sync)
create or replace function append_agent_progress(
  p_task_id uuid,
  p_event jsonb
)
returns void as $$
begin
  update tasks
  set agent_progress = array_append(agent_progress, p_event)
  where id = p_task_id;
end;
$$ language plpgsql;

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for tasks table (for cross-device sync)
alter publication supabase_realtime add table tasks;

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on table tasks is 'Main tasks table with agentic workflow support';
comment on column tasks.agent_progress is 'Array of progress events for real-time streaming';
comment on column tasks.pending_drafts is 'Agent-generated drafts awaiting user confirmation';
comment on column tasks.failure_state is 'Structured failure info when agent gives up';
comment on table agent_steps is 'Saga-style step tracking for agent tool calls';
comment on table audit_log is 'Security and compliance audit trail';
