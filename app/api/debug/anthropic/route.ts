/**
 * Debug endpoint to test Anthropic API key directly
 *
 * This isolates the API key issue by:
 * 1. Showing what key Next.js sees
 * 2. Testing the key directly with a minimal API call
 * 3. Showing the full error response
 */

import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const debug = {
    timestamp: new Date().toISOString(),
    envCheck: {
      ANTHROPIC_API_KEY_exists: !!apiKey,
      ANTHROPIC_API_KEY_length: apiKey?.length ?? 0,
      ANTHROPIC_API_KEY_prefix: apiKey?.substring(0, 20) + '...',
      ANTHROPIC_API_KEY_suffix: '...' + apiKey?.substring(apiKey.length - 10),
      // Check for common issues
      hasLeadingWhitespace: apiKey?.startsWith(' ') || apiKey?.startsWith('\t'),
      hasTrailingWhitespace: apiKey?.endsWith(' ') || apiKey?.endsWith('\n') || apiKey?.endsWith('\t'),
      hasQuotes: apiKey?.includes('"') || apiKey?.includes("'"),
    },
    apiTest: null as any,
  };

  // Test the API directly
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "test"' }],
      });

      debug.apiTest = {
        success: true,
        model: response.model,
        stopReason: response.stop_reason,
        content: response.content,
      };
    } catch (error: any) {
      debug.apiTest = {
        success: false,
        errorType: error?.constructor?.name,
        errorMessage: error?.message,
        statusCode: error?.status,
        errorBody: error?.error,
        rawError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      };
    }
  } else {
    debug.apiTest = {
      success: false,
      errorMessage: 'No API key found in environment',
    };
  }

  return new Response(JSON.stringify(debug, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
