-- Add columns for cross-device sync support
-- These columns enable syncing tasks between web and mobile (iOS)

-- Add sync-related columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS feedback jsonb,
  ADD COLUMN IF NOT EXISTS agent_quick_info jsonb,
  ADD COLUMN IF NOT EXISTS custom_prompt text,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;  -- Soft delete for sync

-- Update status enum to match client-side TaskStatus type
-- Note: PostgreSQL doesn't allow removing enum values, only adding
DO $$ BEGIN
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'researching';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'personal';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'completed';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_not_deleted ON tasks(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(user_id, version);

-- Version increment trigger (server-side, authoritative)
-- This ensures the server controls versioning for conflict resolution
CREATE OR REPLACE FUNCTION increment_task_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS task_version_trigger ON tasks;

-- Create the trigger
CREATE TRIGGER task_version_trigger
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION increment_task_version();

-- Comments for documentation
COMMENT ON COLUMN tasks.feedback IS 'User feedback on task completion (positive/negative)';
COMMENT ON COLUMN tasks.agent_quick_info IS 'Key facts extracted by agent (phone, hours, etc.)';
COMMENT ON COLUMN tasks.custom_prompt IS 'Custom prompt for insight-driven tasks';
COMMENT ON COLUMN tasks.version IS 'Server-incremented version for conflict resolution';
COMMENT ON COLUMN tasks.deleted_at IS 'Soft delete timestamp for sync (null = not deleted)';
