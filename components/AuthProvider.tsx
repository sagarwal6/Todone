'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { isNativePlatform } from '@/lib/utils/platform';

// iOS OAuth Client ID (public, not a secret)
const IOS_CLIENT_ID = '569427904271-0gs6jvpu4hq0plfmn2nqaqv81l3jgfed.apps.googleusercontent.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize Google Auth plugin on native platforms
  useEffect(() => {
    if (isNativePlatform()) {
      import('@capgo/capacitor-social-login').then(({ SocialLogin }) => {
        SocialLogin.initialize({
          google: {
            iOSClientId: IOS_CLIENT_ID,
            iOSServerClientId: IOS_CLIENT_ID,
          },
        });
      });
    }
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
