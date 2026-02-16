/**
 * User Account API
 *
 * DELETE - Permanently delete user account and all associated data
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase/server';
import { revokeTokens } from '@/lib/google/auth';

/**
 * DELETE /api/user
 * Permanently deletes the authenticated user's account and all data.
 *
 * Deletion order:
 * 1. Log deletion event (anonymized) in audit_log
 * 2. Revoke Google OAuth tokens (+ deletes oauth_tokens row)
 * 3. Delete profile row (cascades to tasks, agent_steps, task_messages,
 *    rate_limits, insight_scans, insight_actions; audit_log user_id SET NULL)
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    // 1. Log the deletion event before we delete anything
    //    audit_log.user_id has ON DELETE SET NULL, so this row survives
    await supabaseAdmin.from('audit_log').insert({
      user_id: userId,
      action: 'account_deleted',
      details: { reason: 'user_initiated' },
    });

    // 2. Revoke Google OAuth tokens with Google + delete from DB
    try {
      await revokeTokens(userId);
    } catch (err) {
      // Continue even if revocation fails — token will expire on its own
      console.error('Token revocation failed during account deletion:', err);
    }

    // 3. Delete profile — cascades to all user data
    //    (tasks → agent_steps + task_messages, rate_limits,
    //     insight_scans → insight_actions, oauth_tokens)
    const { error } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Failed to delete profile:', error);
      return NextResponse.json(
        { error: 'Failed to delete account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
