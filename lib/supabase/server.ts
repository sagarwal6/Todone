import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Server-side Supabase client with service role key
 * ONLY use in server-side code (API routes, server components)
 * Bypasses RLS for admin operations
 *
 * Note: Using lazy initialization to avoid build-time errors
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabaseAdmin: SupabaseClient<any> | null = null;

export function getSupabaseAdmin(): SupabaseClient<any> {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _supabaseAdmin;
}

// For backwards compatibility - lazy getter
export const supabaseAdmin = new Proxy({} as SupabaseClient<any>, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});

/**
 * Typed Supabase client - use when schema is properly synced
 */
let _supabaseTyped: SupabaseClient<Database> | null = null;

export function getSupabaseTyped(): SupabaseClient<Database> {
  if (!_supabaseTyped) {
    _supabaseTyped = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _supabaseTyped;
}

export const supabaseTyped = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return (getSupabaseTyped() as any)[prop];
  },
});

/**
 * Create a Supabase client for a specific user context
 * Uses the service role key but can impersonate a user for RLS
 */
export function getSupabaseAdminForUser(userId: string) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          // This allows RLS policies to work with the user's ID
          'x-supabase-auth-user-id': userId,
        },
      },
    }
  );
}

/**
 * Helper to log audit events
 */
export async function logAuditEvent(
  userId: string | null,
  taskId: string | null,
  action: string,
  details?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('log_audit_event', {
      p_user_id: userId,
      p_task_id: taskId,
      p_action: action,
      p_details: details ?? null,
      p_ip_address: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      console.error('Failed to log audit event:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Audit logging error:', err);
    return null;
  }
}

/**
 * Check rate limit for a user and endpoint
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limits?: { perMinute?: number; perHour?: number; perDay?: number }
): Promise<{
  allowed: boolean;
  limitType?: 'minute' | 'hour' | 'day';
  resetAt?: Date;
}> {
  const { perMinute = 5, perHour = 30, perDay = 100 } = limits ?? {};

  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_per_minute: perMinute,
      p_max_per_hour: perHour,
      p_max_per_day: perDay,
    });

    if (error) {
      console.error('Rate limit check failed:', error);
      // Fail open if rate limiting is broken
      return { allowed: true };
    }

    const result = data?.[0];
    if (!result) {
      return { allowed: true };
    }

    return {
      allowed: result.allowed,
      limitType: result.limit_type as 'minute' | 'hour' | 'day' | undefined,
      resetAt: result.reset_at ? new Date(result.reset_at) : undefined,
    };
  } catch (err) {
    console.error('Rate limit error:', err);
    return { allowed: true };
  }
}
