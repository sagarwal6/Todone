-- Insight Scan Bundles Schema Update
-- Migration: 005_insight_scan_bundles.sql
-- Created: 2026-02-09
--
-- Adds support for the new bundled insight format with greeting,
-- quickWin, and bundles structure.

-- ============================================================================
-- ADD NEW COLUMNS TO insight_scans
-- ============================================================================

-- Greeting message (personalized insight)
ALTER TABLE insight_scans
ADD COLUMN IF NOT EXISTS greeting TEXT;

-- Quick win action (JSON object or null)
ALTER TABLE insight_scans
ADD COLUMN IF NOT EXISTS quick_win JSONB;

-- Bundled actions (JSON array of bundles)
ALTER TABLE insight_scans
ADD COLUMN IF NOT EXISTS bundles JSONB;

-- ============================================================================
-- UPDATE get_cached_insight_scan FUNCTION
-- ============================================================================

-- Drop existing function first (can't change return type with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS get_cached_insight_scan(UUID);

-- Recreate with new columns
CREATE OR REPLACE FUNCTION get_cached_insight_scan(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  status insight_scan_status,
  portrait JSONB,
  context_summary JSONB,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  greeting TEXT,
  quick_win JSONB,
  bundles JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.status,
    s.portrait,
    s.context_summary,
    s.created_at,
    s.expires_at,
    s.greeting,
    s.quick_win,
    s.bundles
  FROM insight_scans s
  WHERE s.user_id = p_user_id
    AND s.expires_at > NOW()
    AND s.status IN ('complete', 'partial')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN insight_scans.greeting IS 'Personalized greeting showing insight about user patterns';
COMMENT ON COLUMN insight_scans.quick_win IS 'Single highest-impact action as JSON';
COMMENT ON COLUMN insight_scans.bundles IS 'Array of action bundles grouped by type';
