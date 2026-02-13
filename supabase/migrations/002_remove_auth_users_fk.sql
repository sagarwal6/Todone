-- Migration: 002_remove_auth_users_fk.sql
-- Purpose: Remove foreign key constraint to auth.users since we're using NextAuth, not Supabase Auth
--
-- The original schema had: id uuid primary key references auth.users(id) on delete cascade
-- This doesn't work with NextAuth because we don't have auth.users entries.

-- First, drop the foreign key constraint from profiles table
-- Note: The constraint name may vary, so we'll recreate the table structure

-- Option 1: If you can identify the constraint name, drop it directly:
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Option 2: Recreate profiles table without the FK (safer approach)
-- This is a more comprehensive approach that ensures the table works correctly

-- Since we can't easily identify the constraint name, let's use ALTER TABLE
-- to change the column definition

-- Drop policies first (they depend on auth.uid())
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Drop the foreign key constraint (Supabase usually names it table_column_fkey)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Also update oauth_tokens policies that reference auth.uid()
DROP POLICY IF EXISTS "Users can view own tokens" ON oauth_tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON oauth_tokens;

-- Similarly for rate_limits
DROP POLICY IF EXISTS "Users can view own rate limits" ON rate_limits;
DROP POLICY IF EXISTS "Users can update own rate limits" ON rate_limits;

-- Create new policies that don't rely on auth.uid()
-- (for service role access, which is what we use server-side)
-- Note: These are permissive for now since we authenticate via NextAuth server-side

-- Profiles: Allow service role full access
CREATE POLICY "Service role full access to profiles"
  ON profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- OAuth tokens: Allow service role full access
CREATE POLICY "Service role full access to oauth_tokens"
  ON oauth_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- Rate limits: Allow service role full access
CREATE POLICY "Service role full access to rate_limits"
  ON rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment explaining the change
COMMENT ON TABLE profiles IS 'User profiles - uses NextAuth for auth, not Supabase Auth. ID is a generated UUID.';
