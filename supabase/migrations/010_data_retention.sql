-- ============================================================================
-- DATA RETENTION POLICY
-- ============================================================================
-- Retention periods:
--   agent_steps:  90 days (execution traces, not user-facing)
--   audit_log:    1 year (compliance records)
--   rate_limits:  7 days (ephemeral rate limit counters)
--
-- NOT auto-deleted: tasks, task_messages, profiles, oauth_tokens
-- (user-facing data persists until user actively deletes)
-- ============================================================================

-- Function to clean up old data per retention policy
create or replace function cleanup_expired_data()
returns void as $$
begin
  -- agent_steps older than 90 days
  delete from agent_steps
  where created_at < now() - interval '90 days';

  -- audit_log older than 1 year
  delete from audit_log
  where created_at < now() - interval '1 year';

  -- rate_limits not updated in 7 days (stale counters)
  delete from rate_limits
  where updated_at < now() - interval '7 days';
end;
$$ language plpgsql security definer;

-- Schedule daily cleanup at 3 AM UTC via pg_cron
-- Note: pg_cron must be enabled in Supabase dashboard (Database > Extensions)
-- If pg_cron is not available, run cleanup_expired_data() manually or via an external cron
select cron.schedule(
  'cleanup-expired-data',
  '0 3 * * *',
  $$select cleanup_expired_data()$$
);
