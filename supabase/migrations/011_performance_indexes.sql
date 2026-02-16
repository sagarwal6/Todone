-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
-- Add missing composite indexes for common query patterns

-- task_messages sorted by creation time (conversation display)
CREATE INDEX IF NOT EXISTS idx_task_messages_task_created
  ON task_messages(task_id, created_at);

-- tasks sorted by recency per user (task list view)
CREATE INDEX IF NOT EXISTS idx_tasks_user_created
  ON tasks(user_id, created_at DESC);

-- ============================================================================
-- RLS DOCUMENTATION
-- ============================================================================
-- Security model: NextAuth + Supabase (service_role only)
--
-- Because we use NextAuth for authentication (not Supabase Auth),
-- auth.uid() is not available in RLS policies. Instead:
--
-- 1. All Supabase access uses the service_role key (server-side only)
-- 2. RLS policies restrict access to service_role — no direct client access
-- 3. User data isolation is enforced by .eq('user_id', userId) in every
--    API route, using the user ID from the NextAuth session
-- 4. The service_role key is never exposed to the client
--
-- This is defense-in-depth: even if the anon key were compromised,
-- RLS would block all access since policies only allow service_role.
