/**
 * Email Content API Route
 *
 * Fetches full email content for preview in insight expansion.
 * Returns the email body for display before drafting a reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/google/auth';
import { readEmail } from '@/lib/google/gmail';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  // Get session
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Get access token
  const accessToken = await getValidAccessToken(profile.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No valid access token. Please reconnect your Google account.' },
      { status: 401 }
    );
  }

  try {
    // Fetch full email content (without thread for now)
    const email = await readEmail(accessToken, messageId, false);

    return NextResponse.json({
      success: true,
      email: {
        id: email.id,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        date: email.date,
        body: email.body,
        snippet: email.snippet,
      },
    });
  } catch (error) {
    console.error('[EMAIL FETCH] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch email' },
      { status: 500 }
    );
  }
}
