-- Add location and timezone columns to profiles for personalization
-- Location is auto-detected from calendar events and used for local searches
-- Timezone is used for date/time formatting

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.location IS 'User location for local searches (e.g., "San Francisco, CA")';
COMMENT ON COLUMN profiles.timezone IS 'User timezone (e.g., "America/Los_Angeles")';
