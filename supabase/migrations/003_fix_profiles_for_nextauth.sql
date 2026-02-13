-- Migration: 003_fix_profiles_for_nextauth.sql
-- Purpose: Fix profiles table for NextAuth (not Supabase Auth)
--
-- Issues being fixed:
-- 1. FK constraint to auth.users blocks profile creation
-- 2. RLS policies reference auth.uid() which doesn't exist with NextAuth

-- Drop the foreign key constraint that references auth.users
-- This is blocking profile creation since we use NextAuth, not Supabase Auth
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Drop old RLS policies that use auth.uid()
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own tokens" ON oauth_tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON oauth_tokens;
DROP POLICY IF EXISTS "Users can view own rate limits" ON rate_limits;
DROP POLICY IF EXISTS "Users can update own rate limits" ON rate_limits;

-- Drop any existing service role policies to avoid duplicates
DROP POLICY IF EXISTS "Service role full access to profiles" ON profiles;
DROP POLICY IF EXISTS "Service role full access to oauth_tokens" ON oauth_tokens;
DROP POLICY IF EXISTS "Service role full access to rate_limits" ON rate_limits;

-- Create new permissive policies for service role access
-- Since we authenticate via NextAuth server-side and use service role key
CREATE POLICY "Service role full access to profiles"
  ON profiles FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to oauth_tokens"
  ON oauth_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to rate_limits"
  ON rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment explaining the change
COMMENT ON TABLE profiles IS 'User profiles - uses NextAuth for auth, not Supabase Auth. ID is a generated UUID.';
