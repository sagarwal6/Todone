/**
 * Debug endpoint to check OAuth token status
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return Response.json({ error: 'Not authenticated', session: null });
  }

  // Get profile info from database
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('id', session.user.id)
    .single();

  // Check OAuth tokens
  const result = await supabaseAdmin
    .from('oauth_tokens')
    .select('id, provider, access_token_expires_at, created_at, updated_at')
    .eq('user_id', session.user.id);

  const tokens = result.data;
  const tokenError = result.error;

  // Check if token is expired
  const googleToken = tokens?.find((t: { provider: string }) => t.provider === 'google');
  const isExpired = googleToken
    ? new Date(googleToken.access_token_expires_at) < new Date()
    : null;

  return Response.json({
    session: {
      email: session.user.email,
      name: session.user.name,
    },
    profile: profile || null,
    profileError: profileError?.message || null,
    tokens: tokens?.map((t: { id: string; provider: string; access_token_expires_at: string; created_at: string; updated_at: string }) => ({
      id: t.id,
      provider: t.provider,
      expires_at: t.access_token_expires_at,
      created_at: t.created_at,
      updated_at: t.updated_at,
    })) || null,
    tokenError: tokenError?.message || null,
    googleTokenStatus: {
      exists: !!googleToken,
      isExpired,
      expiresAt: googleToken?.access_token_expires_at || null,
    },
  });
}
