/**
 * Google OAuth Authentication with Token Rotation
 *
 * Implements RFC 9700 best practices:
 * - Refresh token rotation
 * - PKCE for OAuth flow
 * - Token expiration handling
 */

import { supabaseAdmin, logAuditEvent } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/utils/encryption';

// Google OAuth endpoints
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Required scopes — read-only access only
// No write scopes (gmail.compose, calendar.events, gmail.send) requested
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface TokenData {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

/**
 * Generate PKCE code verifier and challenge using S256 method
 * SECURITY: Uses SHA-256 hash for code challenge (RFC 7636)
 */
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  // Generate a random code verifier (43-128 characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = base64UrlEncode(array);

  // Generate code challenge using SHA-256 (S256 method)
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64UrlEncode(new Uint8Array(hashBuffer));

  return { codeVerifier, codeChallenge };
}

/**
 * Generate the OAuth authorization URL with PKCE
 */
export function getAuthorizationUrl(
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Force consent to get refresh token
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256', // SECURITY: SHA-256 method per RFC 7636
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenData> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data: TokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresh access token with token rotation
 *
 * Per RFC 9700, when refreshing tokens:
 * - We may receive a new refresh token
 * - The old refresh token should be invalidated
 * SECURITY: New tokens are encrypted before storing
 */
export async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<TokenData> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data: TokenResponse = await response.json();

  // Update tokens in database with rotation
  const now = new Date();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Encrypt new tokens before storing
  const encryptedAccessToken = await encrypt(data.access_token);
  const encryptedRefreshToken = data.refresh_token
    ? await encrypt(data.refresh_token)
    : null;

  // Build update object
  const updateData: Record<string, unknown> = {
    access_token: encryptedAccessToken,
    access_token_expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString(),
  };

  // If we got a new refresh token, update it
  if (encryptedRefreshToken) {
    updateData.refresh_token = encryptedRefreshToken;
    updateData.refresh_token_issued_at = now.toISOString();
    // Increment rotation count
    await supabaseAdmin.rpc('increment_rotation_count', { p_user_id: userId });
  }

  await supabaseAdmin
    .from('oauth_tokens')
    .update(updateData)
    .eq('user_id', userId)
    .eq('provider', 'google');

  // Audit: log token refresh event (no token content)
  logAuditEvent(userId, null, 'token_refresh', { rotated: !!data.refresh_token }).catch(() => {});

  // Return unencrypted tokens for immediate use
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  };
}

/**
 * Check if a token is a plaintext Google token (not encrypted)
 * Google access tokens start with "ya29." and refresh tokens start with "1//"
 */
function isPlaintextToken(token: string): boolean {
  return token.startsWith('ya29.') || token.startsWith('1//');
}

/**
 * Safely decrypt a token, handling both encrypted and legacy plaintext tokens
 * During migration, some tokens may still be plaintext
 */
async function safeDecrypt(token: string): Promise<string> {
  // If it's a plaintext Google token, return as-is
  if (isPlaintextToken(token)) {
    return token;
  }
  // Otherwise, decrypt it
  return await decrypt(token);
}

/**
 * Get a valid access token for a user
 * Automatically refreshes if expired
 * SECURITY: Tokens are decrypted from encrypted storage
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data: tokens, error } = await supabaseAdmin
    .from('oauth_tokens')
    .select('access_token, refresh_token, access_token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokens) {
    return null;
  }

  const expiresAt = new Date(tokens.access_token_expires_at);
  const now = new Date();

  // If token is still valid (with 10 minute buffer), return it
  // SECURITY: Increased buffer from 5 to 10 minutes to prevent mid-request expiration
  if (expiresAt.getTime() - now.getTime() > 10 * 60 * 1000) {
    // Decrypt the access token before returning (handles both encrypted and plaintext)
    try {
      return await safeDecrypt(tokens.access_token);
    } catch (decryptError) {
      console.error('Failed to decrypt access token:', decryptError);
      return null;
    }
  }

  // Token expired or about to expire - refresh it
  if (!tokens.refresh_token) {
    return null;
  }

  try {
    // Decrypt refresh token first (handles both encrypted and plaintext)
    const decryptedRefreshToken = await safeDecrypt(tokens.refresh_token);
    const newTokens = await refreshAccessToken(userId, decryptedRefreshToken);
    return newTokens.accessToken;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    return null;
  }
}

/**
 * Store tokens for a user
 * SECURITY: Tokens are encrypted at rest using AES-GCM
 */
export async function storeTokens(
  userId: string,
  tokens: TokenData,
  scopes: string[]
): Promise<void> {
  // Encrypt tokens before storing
  const encryptedAccessToken = await encrypt(tokens.accessToken);
  const encryptedRefreshToken = tokens.refreshToken
    ? await encrypt(tokens.refreshToken)
    : null;

  await supabaseAdmin
    .from('oauth_tokens')
    .upsert({
      user_id: userId,
      provider: 'google',
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      access_token_expires_at: tokens.expiresAt.toISOString(),
      refresh_token_issued_at: new Date().toISOString(),
      scopes,
      token_rotation_count: 0,
    });
}

/**
 * Revoke tokens for a user
 * SECURITY: Decrypts token before revoking with Google
 */
export async function revokeTokens(userId: string): Promise<void> {
  const { data: tokens } = await supabaseAdmin
    .from('oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (tokens?.access_token) {
    try {
      // Decrypt token before revoking (handles both encrypted and plaintext)
      const decryptedToken = await safeDecrypt(tokens.access_token);
      // Revoke with Google
      const revokeResponse = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${decryptedToken}`,
        { method: 'POST' }
      );
      if (!revokeResponse.ok) {
        console.warn('Token revocation returned non-OK status:', revokeResponse.status);
      }
    } catch (error) {
      console.error('Failed to revoke token with Google:', error);
      // Continue to delete from database even if revocation fails
    }
  }

  // Delete from database
  await supabaseAdmin
    .from('oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');
}

/**
 * Check if user has required scopes
 */
export async function hasRequiredScopes(
  userId: string,
  requiredScopes: string[]
): Promise<boolean> {
  const { data: tokens } = await supabaseAdmin
    .from('oauth_tokens')
    .select('scopes')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (!tokens?.scopes) {
    return false;
  }

  return requiredScopes.every((scope) => tokens.scopes.includes(scope));
}

// Helper function for base64url encoding
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
