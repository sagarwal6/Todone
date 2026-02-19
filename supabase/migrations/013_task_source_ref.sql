-- Migration 013: Add source_ref column to tasks
-- Stores a stable reference ID for insight-sourced tasks:
--   - Calendar event ID (eventId) for meeting preps
--   - Gmail thread ID (threadId) for email drafts
-- This enables durable lookup of existing preps across scans.

ALTER TABLE tasks ADD COLUMN source_ref TEXT;

-- Partial index for efficient lookup of insight tasks by source_ref
CREATE INDEX idx_tasks_source_ref
  ON tasks(user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;
