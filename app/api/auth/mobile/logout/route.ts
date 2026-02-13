import { NextRequest, NextResponse } from 'next/server';
import { verifyMobileSession } from '@/lib/utils/jwt';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = verifyMobileSession(authHeader.slice(7));
  if (payload) {
    // Clear OAuth tokens for user
    await supabaseAdmin
      .from('oauth_tokens')
      .delete()
      .eq('user_id', payload.userId)
      .eq('provider', 'google');
  }

  return NextResponse.json({ success: true });
}
