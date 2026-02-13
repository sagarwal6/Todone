-- Fix overly permissive RLS policies
-- These policies were set to USING (true) which bypasses RLS entirely
-- Since we use NextAuth (not Supabase Auth), auth.uid() doesn't work,
-- so we rely on server-side filtering via supabaseAdmin.
-- RLS provides defense-in-depth, not primary access control.

-- Remove broken policies on profiles
DROP POLICY IF EXISTS "Service role full access to profiles" ON profiles;

-- Remove broken policies on oauth_tokens
DROP POLICY IF EXISTS "Service role full access to oauth_tokens" ON oauth_tokens;

-- Create more restrictive policies
-- Note: These use 'true' for service role access but should still be combined
-- with proper user_id filtering in API routes

-- Profiles: Only allow service role operations (no direct client access)
CREATE POLICY "Service role can manage profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- OAuth tokens: Only allow service role operations (tokens should never be client-accessible)
CREATE POLICY "Service role can manage oauth_tokens"
  ON oauth_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add RLS policy to audit_log (was enabled but had no policies)
CREATE POLICY "Service role can manage audit_log"
  ON audit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comment explaining security model
COMMENT ON TABLE oauth_tokens IS 'OAuth tokens - service role only, encrypted at rest';
COMMENT ON TABLE profiles IS 'User profiles - service role only for server-side operations';
COMMENT ON TABLE audit_log IS 'Audit log - service role only, append-mostly';
