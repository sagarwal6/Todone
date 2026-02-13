-- Add source and agent steps summary columns for cross-device sync
-- These columns track where tasks originated and preserve agent execution history

-- Add source column to track task origin
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'user';

-- Add agent_steps_summary column for persisted agent execution steps
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS agent_steps_summary jsonb DEFAULT '[]'::jsonb;

-- Add constraint to validate source values
DO $$ BEGIN
  ALTER TABLE tasks
    ADD CONSTRAINT tasks_source_check
    CHECK (source IN ('user', 'insight'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Index for querying tasks by source
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(user_id, source);

-- Comments for documentation
COMMENT ON COLUMN tasks.source IS 'Origin of task: user (manual input) or insight (from insight scan)';
COMMENT ON COLUMN tasks.agent_steps_summary IS 'Persisted summary of agent execution steps for display';
