/**
 * Test endpoint to verify Supabase connection
 */

import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  console.log('=== Testing Supabase connection ===');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'NOT SET');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set (length: ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'NOT SET');

  try {
    // Test query
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return new Response(JSON.stringify({
        status: 'error',
        message: error.message,
        hint: error.hint,
        code: error.code,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Try inserting a test row
    const testId = crypto.randomUUID();
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: testId,
        email: `test-${Date.now()}@example.com`,
        full_name: 'Test User',
      })
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({
        status: 'insert_error',
        message: insertError.message,
        hint: insertError.hint,
        code: insertError.code,
        details: insertError.details,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clean up test row
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', testId);

    return new Response(JSON.stringify({
      status: 'ok',
      message: 'Supabase connection working!',
      testInsert: 'successful',
      insertedData: insertData,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Exception:', e);
    return new Response(JSON.stringify({
      status: 'exception',
      message: e instanceof Error ? e.message : String(e),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
