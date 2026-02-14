'use client';

import { useState, useCallback, useEffect } from 'react';
import { isNativePlatform } from '@/lib/utils/platform';

// iOS OAuth Client ID (public, not a secret)
// This is used for both native sign-in and as the server client ID
// The backend verifies tokens against this audience in /api/auth/mobile
const IOS_CLIENT_ID = '569427904271-0gs6jvpu4hq0plfmn2nqaqv81l3jgfed.apps.googleusercontent.com';

interface NativeUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

interface MobileSession {
  token: string;
  user: NativeUser;
  expiresAt: number;
}

const STORAGE_KEY = 'mobileSession';

export function useNativeAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileUser, setMobileUser] = useState<NativeUser | null>(null);

  // Load saved session on mount
  useEffect(() => {
    if (!isNativePlatform()) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const session: MobileSession = JSON.parse(saved);
        if (session.expiresAt > Date.now()) {
          setMobileUser(session.user);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const signInNative = useCallback(async (): Promise<NativeUser | null> => {
    if (!isNativePlatform()) {
      setError('Native sign-in only available on mobile');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Dynamic import to avoid SSR issues
      const { SocialLogin } = await import('@capgo/capacitor-social-login');

      // Re-initialize before login to ensure clean state after logout
      await SocialLogin.initialize({
        google: {
          iOSClientId: IOS_CLIENT_ID,
          iOSServerClientId: IOS_CLIENT_ID,
        },
      });

      const result = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: [
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/contacts.readonly',
          ],
        },
      });

      // Handle online vs offline response types
      const googleResult = result.result;
      if (googleResult.responseType === 'offline') {
        throw new Error('Unexpected offline response - please try again');
      }

      if (!googleResult.idToken) {
        throw new Error('No ID token received');
      }

      const response = await fetch('/api/auth/mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: googleResult.idToken,
          accessToken: googleResult.accessToken?.token,
          refreshToken: googleResult.accessToken?.refreshToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Authentication failed');
      }

      const data = await response.json();

      // Store session with 7-day expiry
      const session: MobileSession = {
        token: data.token,
        user: data.user,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setMobileUser(data.user);

      return data.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOutNative = useCallback(async () => {
    if (!isNativePlatform()) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const session: MobileSession = JSON.parse(saved);
        // Fire and forget - don't wait for server logout
        fetch('/api/auth/mobile/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        }).catch(() => {});
      }

      // Clear local state first
      localStorage.removeItem(STORAGE_KEY);
      setMobileUser(null);

      // Then logout from Google SDK
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      try {
        await SocialLogin.logout({ provider: 'google' });
      } catch (logoutErr) {
        // Google logout can fail if not signed in, ignore
        console.log('Google logout:', logoutErr);
      }
    } catch (err) {
      console.error('Native sign-out error:', err);
      // Still clear local state even if anything fails
      localStorage.removeItem(STORAGE_KEY);
      setMobileUser(null);
    }
  }, []);

  const getAuthHeader = useCallback((): Record<string, string> => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const session: MobileSession = JSON.parse(saved);
        return { Authorization: `Bearer ${session.token}` };
      } catch {
        return {};
      }
    }
    return {};
  }, []);

  const getMobileToken = useCallback((): string | null => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const session: MobileSession = JSON.parse(saved);
        return session.token;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  return {
    signInNative,
    signOutNative,
    getAuthHeader,
    getMobileToken,
    mobileUser,
    isLoading,
    error,
  };
}
