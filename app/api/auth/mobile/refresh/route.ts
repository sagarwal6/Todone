import { NextRequest, NextResponse } from 'next/server';
import { verifyMobileSession, signMobileSession } from '@/lib/utils/jwt';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/utils/encryption';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const currentToken = authHeader.slice(7);
  const payload = verifyMobileSession(currentToken);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // Optionally update Google OAuth tokens if provided
  const body = await request.json().catch(() => ({}));
  if (body.accessToken) {
    const encryptedAccessToken = await encrypt(body.accessToken);
    await supabaseAdmin.from('oauth_tokens').update({
      access_token: encryptedAccessToken,
      access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', payload.userId).eq('provider', 'google');
  }

  // Issue new JWT
  const newToken = signMobileSession({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    image: payload.image,
  });

  return NextResponse.json({ token: newToken });
}
