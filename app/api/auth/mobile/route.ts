import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/utils/encryption';
import { signMobileSession } from '@/lib/utils/jwt';

const client = new OAuth2Client();

export async function POST(request: NextRequest) {
  try {
    const { idToken, accessToken, refreshToken } = await request.json();

    if (!idToken || !accessToken) {
      return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
    }

    // Verify ID token with Google (accept both web and iOS client IDs)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID!,
        process.env.IOS_GOOGLE_CLIENT_ID!,
      ].filter(Boolean),
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { email, name, picture } = payload;

    // Upsert profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    let profileId: string;
    if (existingProfile) {
      profileId = existingProfile.id;
      await supabaseAdmin
        .from('profiles')
        .update({ full_name: name, avatar_url: picture, updated_at: new Date().toISOString() })
        .eq('id', profileId);
    } else {
      profileId = uuidv4();
      await supabaseAdmin.from('profiles').insert({
        id: profileId,
        email,
        full_name: name,
        avatar_url: picture,
      });
    }

    // Store encrypted OAuth tokens
    const encryptedAccessToken = await encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? await encrypt(refreshToken) : null;

    await supabaseAdmin.from('oauth_tokens').upsert({
      user_id: profileId,
      provider: 'google',
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      scopes: ['email', 'profile', 'gmail.readonly', 'calendar.readonly', 'contacts.readonly'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    // Issue JWT for mobile session (7-day expiry)
    const sessionToken = signMobileSession({
      userId: profileId,
      email,
      name: name || '',
      image: picture,
    });

    return NextResponse.json({
      success: true,
      token: sessionToken,
      user: { id: profileId, email, name, image: picture },
    });
  } catch (error) {
    console.error('Mobile auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}
