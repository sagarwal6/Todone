-- Migration 012: Rename 'archived' status to 'someday'
-- Supports the GTD "Someday/Maybe" concept

-- Add 'someday' to the enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'someday';

-- Migrate existing archived tasks
UPDATE tasks SET status = 'someday' WHERE status = 'archived';
