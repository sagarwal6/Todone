import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Client-side Supabase client
 * Uses the anonymous key for browser-side operations with RLS
 */
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Get a Supabase client with a specific access token
 * Useful for authenticated requests on the client
 */
export function getSupabaseClient(accessToken?: string) {
  if (!accessToken) {
    return supabase;
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}
