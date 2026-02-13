-- Insight Scan Database Schema
-- Migration: 004_insight_scan.sql
-- Created: 2026-02-09
--
-- This schema implements the proactive insight scanning feature that
-- analyzes email and calendar metadata to surface actionable items.

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Scan status enum
CREATE TYPE insight_scan_status AS ENUM (
  'in_progress',
  'complete',
  'partial',   -- Some sources failed but we have results
  'failed'
);

-- Action types that the scan can suggest
CREATE TYPE insight_action_type AS ENUM (
  'draft_response',  -- Reply to an email waiting for response
  'meeting_prep',    -- Prepare for an upcoming meeting
  'follow_up',       -- Follow up on sent email with no reply
  'smart_label'      -- Organize emails from frequent sender
);

-- Action priority levels
CREATE TYPE insight_action_priority AS ENUM (
  'high',
  'medium',
  'low'
);

-- Status of individual actions
CREATE TYPE insight_action_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'failed',
  'dismissed'
);

-- ============================================================================
-- INSIGHT SCANS TABLE
-- ============================================================================

CREATE TABLE insight_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Scan status
  status insight_scan_status NOT NULL DEFAULT 'in_progress',

  -- Analysis results
  portrait JSONB,  -- { summary, patterns[], urgentItems[] }

  -- Summary of what was scanned (not full context to save space)
  context_summary JSONB,  -- { emailsScanned, eventsScanned, errors[] }

  -- Error tracking
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour' NOT NULL
);

-- Enable RLS
ALTER TABLE insight_scans ENABLE ROW LEVEL SECURITY;

-- Scan policies
CREATE POLICY "Users can view own scans"
  ON insight_scans FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own scans"
  ON insight_scans FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own scans"
  ON insight_scans FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own scans"
  ON insight_scans FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- INSIGHT ACTIONS TABLE
-- ============================================================================

CREATE TABLE insight_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES insight_scans(id) ON DELETE CASCADE NOT NULL,

  -- Action details
  type insight_action_type NOT NULL,
  priority insight_action_priority NOT NULL,
  headline TEXT NOT NULL,
  detail TEXT,

  -- Type-specific context for execution
  -- Schema varies by type (DraftResponseContext, MeetingPrepContext, etc.)
  execution_context JSONB NOT NULL,

  -- Execution status
  status insight_action_status NOT NULL DEFAULT 'pending',

  -- Result of execution (if completed)
  result JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE insight_actions ENABLE ROW LEVEL SECURITY;

-- Action policies (inherit access from parent scan)
CREATE POLICY "Users can view own actions"
  ON insight_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM insight_scans s
      WHERE s.id = insight_actions.scan_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own actions"
  ON insight_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM insight_scans s
      WHERE s.id = insight_actions.scan_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own actions"
  ON insight_actions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM insight_scans s
      WHERE s.id = insight_actions.scan_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own actions"
  ON insight_actions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM insight_scans s
      WHERE s.id = insight_actions.scan_id
      AND s.user_id = auth.uid()
    )
  );

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup of user's recent scans (for caching check)
CREATE INDEX idx_insight_scans_user_expires
  ON insight_scans(user_id, expires_at DESC);

-- Fast lookup of actions by scan and priority
CREATE INDEX idx_insight_actions_scan_priority
  ON insight_actions(scan_id, priority);

-- Fast lookup of pending actions for a scan
CREATE INDEX idx_insight_actions_scan_status
  ON insight_actions(scan_id, status);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get cached scan if it exists and hasn't expired
CREATE OR REPLACE FUNCTION get_cached_insight_scan(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  status insight_scan_status,
  portrait JSONB,
  context_summary JSONB,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.status,
    s.portrait,
    s.context_summary,
    s.created_at,
    s.expires_at
  FROM insight_scans s
  WHERE s.user_id = p_user_id
    AND s.expires_at > NOW()
    AND s.status IN ('complete', 'partial')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get actions for a scan
CREATE OR REPLACE FUNCTION get_insight_actions(p_scan_id UUID)
RETURNS TABLE (
  id UUID,
  type insight_action_type,
  priority insight_action_priority,
  headline TEXT,
  detail TEXT,
  execution_context JSONB,
  status insight_action_status,
  result JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.type,
    a.priority,
    a.headline,
    a.detail,
    a.execution_context,
    a.status,
    a.result,
    a.created_at
  FROM insight_actions a
  WHERE a.scan_id = p_scan_id
  ORDER BY
    CASE a.priority
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    a.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up expired scans (run periodically via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_scans()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM insight_scans
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for insight_scans (for cross-device sync)
ALTER PUBLICATION supabase_realtime ADD TABLE insight_scans;
ALTER PUBLICATION supabase_realtime ADD TABLE insight_actions;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE insight_scans IS 'Proactive email/calendar scan results with 1-hour TTL';
COMMENT ON COLUMN insight_scans.portrait IS 'AI-generated summary of user inbox state';
COMMENT ON COLUMN insight_scans.context_summary IS 'Stats about what was scanned (counts, not content)';

COMMENT ON TABLE insight_actions IS 'Suggested actions from insight scan';
COMMENT ON COLUMN insight_actions.execution_context IS 'Type-specific context needed to execute the action';
COMMENT ON COLUMN insight_actions.status IS 'Tracks whether user has acted on the suggestion';
