'use client';

import { isNativePlatform } from './platform';

const MOBILE_SESSION_KEY = 'mobileSession';

/**
 * Get the mobile auth token from localStorage
 */
function getMobileToken(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(MOBILE_SESSION_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session.expiresAt > Date.now()) {
        return session.token;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get auth headers for API requests.
 * Returns Authorization header with Bearer token for mobile users.
 */
export function getAuthHeaders(): Record<string, string> {
  if (!isNativePlatform()) return {};
  const token = getMobileToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

/**
 * Wrapper around fetch that automatically adds auth headers for mobile users.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
