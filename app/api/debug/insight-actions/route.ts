/**
 * Debug endpoint to check insight actions in the database
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get session
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'Profile not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get recent scans with their actions
  const { data: scans, error: scansError } = await supabaseAdmin
    .from('insight_scans')
    .select(`
      id,
      status,
      greeting,
      quick_win,
      bundles,
      created_at
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (scansError) {
    return new Response(JSON.stringify({ error: scansError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get actions for each scan
  const scansWithActions = await Promise.all(
    (scans || []).map(async (scan) => {
      const { data: actions } = await supabaseAdmin
        .from('insight_actions')
        .select('id, type, headline, status')
        .eq('scan_id', scan.id);

      return {
        ...scan,
        actions: actions || [],
        // Also show the IDs in quick_win and bundles
        quickWinId: scan.quick_win?.id,
        bundleItemIds: (scan.bundles || []).flatMap((b: { items?: { id: string }[] }) =>
          (b.items || []).map((i) => i.id)
        ),
      };
    })
  );

  return new Response(JSON.stringify({
    userId: profile.id,
    scans: scansWithActions,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
