'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { isNativePlatform } from '@/lib/utils/platform';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize Google Auth plugin on native platforms
  useEffect(() => {
    if (isNativePlatform()) {
      import('@capgo/capacitor-social-login').then(({ SocialLogin }) => {
        SocialLogin.initialize({
          google: {
            iOSClientId: process.env.NEXT_PUBLIC_IOS_GOOGLE_CLIENT_ID,
            iOSServerClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          },
        });
      });
    }
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
