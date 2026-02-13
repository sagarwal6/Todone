# iOS Native OAuth Implementation Plan

Implement native Google Sign-In for the Todone iOS app using `@codetrix-studio/capacitor-google-auth`. This bypasses the `403: disallowed_useragent` error when running OAuth in Capacitor WebView.

**Key Architecture Decisions:**
- Mobile auth uses **JWT tokens** (7-day expiry with refresh)
- API routes validate both NextAuth sessions (web) and JWT (mobile)
- Reuses `NEXTAUTH_SECRET` for JWT signing

---

## Phase 0: Prerequisites (Manual - User Must Do)

### Google Cloud Console Setup

- [ ] Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- [ ] Select project: **daily-news-digest-476918** (existing project)
- [ ] Click **+ CREATE CREDENTIALS** → **OAuth client ID**
- [ ] Select Application type: **iOS**
- [ ] Configure:
  - Name: `Todone iOS`
  - Bundle ID: `com.todone.app`
- [ ] Click **CREATE**
- [ ] **Save the iOS Client ID**: `_______________________________________`
- [ ] **Derive Reversed Client ID**: `com.googleusercontent.apps.{ID_WITHOUT_SUFFIX}`

### Environment Variables

- [ ] Add to Vercel: `IOS_GOOGLE_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com`

### Values for Implementation

```
iOS Client ID:      _______________________________________________
Reversed Client ID: com.googleusercontent.apps.___________________
```

---

## Phase 1: Dependencies & Core Utilities

### 1.1 Install Dependencies

- [ ] Run: `npm install @codetrix-studio/capacitor-google-auth google-auth-library jsonwebtoken @types/jsonwebtoken`
- [ ] Run: `npx cap sync ios`

### 1.2 Create JWT Utilities

- [ ] Create `lib/utils/jwt.ts`

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET!;
const JWT_EXPIRES_IN = '7d';

export interface MobileSessionPayload {
  userId: string;
  email: string;
  name: string;
  image?: string;
  iat?: number;
  exp?: number;
}

export function signMobileSession(payload: Omit<MobileSessionPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyMobileSession(token: string): MobileSessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as MobileSessionPayload;
  } catch {
    return null;
  }
}
```

### 1.3 Create Platform Detection Utility

- [ ] Create `lib/utils/platform.ts`

```typescript
'use client';

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).Capacitor?.isNativePlatform?.() ?? false;
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return (window as any).Capacitor?.getPlatform?.() ?? 'web';
}
```

---

## Phase 2: Backend API Endpoints

### 2.1 Create Hybrid Auth Helper

- [ ] Create `lib/auth/getSession.ts`

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { verifyMobileSession, MobileSessionPayload } from '@/lib/utils/jwt';
import { headers } from 'next/headers';

export interface HybridSession {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
  };
  source: 'nextauth' | 'mobile';
}

export async function getHybridSession(): Promise<HybridSession | null> {
  // First try NextAuth session (web users)
  const nextAuthSession = await getServerSession(authOptions);
  if (nextAuthSession?.user?.email) {
    return {
      user: {
        id: (nextAuthSession.user as any).id,
        email: nextAuthSession.user.email,
        name: nextAuthSession.user.name || undefined,
        image: nextAuthSession.user.image || undefined,
      },
      source: 'nextauth',
    };
  }

  // Fall back to JWT token (mobile users)
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyMobileSession(token);
    if (payload) {
      return {
        user: {
          id: payload.userId,
          email: payload.email,
          name: payload.name,
          image: payload.image,
        },
        source: 'mobile',
      };
    }
  }

  return null;
}
```

### 2.2 Create Mobile Sign-In Endpoint

- [ ] Create `app/api/auth/mobile/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/utils/encryption';
import { signMobileSession } from '@/lib/utils/jwt';

const client = new OAuth2Client();

export async function POST(request: NextRequest) {
  try {
    const { idToken, accessToken, refreshToken } = await request.json();

    if (!idToken || !accessToken) {
      return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
    }

    // Verify ID token with Google (accept both web and iOS client IDs)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID!,
        process.env.IOS_GOOGLE_CLIENT_ID!,
      ],
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { email, name, picture } = payload;

    // Upsert profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    let profileId: string;
    if (existingProfile) {
      profileId = existingProfile.id;
      await supabaseAdmin
        .from('profiles')
        .update({ full_name: name, avatar_url: picture, updated_at: new Date().toISOString() })
        .eq('id', profileId);
    } else {
      profileId = uuidv4();
      await supabaseAdmin.from('profiles').insert({
        id: profileId,
        email,
        full_name: name,
        avatar_url: picture,
      });
    }

    // Store encrypted OAuth tokens
    const encryptedAccessToken = await encrypt(accessToken);
    const encryptedRefreshToken = refreshToken ? await encrypt(refreshToken) : null;

    await supabaseAdmin.from('oauth_tokens').upsert({
      user_id: profileId,
      provider: 'google',
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      scopes: ['email', 'profile', 'gmail.readonly', 'calendar.readonly', 'contacts.readonly'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    // Issue JWT for mobile session (7-day expiry)
    const sessionToken = signMobileSession({
      userId: profileId,
      email,
      name: name || '',
      image: picture,
    });

    return NextResponse.json({
      success: true,
      token: sessionToken,
      user: { id: profileId, email, name, image: picture },
    });
  } catch (error) {
    console.error('Mobile auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}
```

### 2.3 Create Token Refresh Endpoint

- [ ] Create `app/api/auth/mobile/refresh/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyMobileSession, signMobileSession } from '@/lib/utils/jwt';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/utils/encryption';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const currentToken = authHeader.slice(7);
  const payload = verifyMobileSession(currentToken);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // Optionally update Google OAuth tokens if provided
  const body = await request.json().catch(() => ({}));
  if (body.accessToken) {
    const encryptedAccessToken = await encrypt(body.accessToken);
    await supabaseAdmin.from('oauth_tokens').update({
      access_token: encryptedAccessToken,
      access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', payload.userId).eq('provider', 'google');
  }

  // Issue new JWT
  const newToken = signMobileSession({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    image: payload.image,
  });

  return NextResponse.json({ token: newToken });
}
```

### 2.4 Create Logout Endpoint

- [ ] Create `app/api/auth/mobile/logout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyMobileSession } from '@/lib/utils/jwt';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = verifyMobileSession(authHeader.slice(7));
  if (payload) {
    // Clear OAuth tokens for user
    await supabaseAdmin
      .from('oauth_tokens')
      .delete()
      .eq('user_id', payload.userId)
      .eq('provider', 'google');
  }

  return NextResponse.json({ success: true });
}
```

---

## Phase 3: Update Protected API Routes

Update all protected routes to use `getHybridSession()` instead of `getServerSession()`.

**Pattern to apply:**
```typescript
// Before:
const session = await getServerSession(authOptions);
if (!session?.user?.email) { ... }

// After:
import { getHybridSession } from '@/lib/auth/getSession';
const session = await getHybridSession();
if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
const userId = session.user.id;
```

### Routes to Update

- [ ] `app/api/tasks/route.ts`
- [ ] `app/api/tasks/[taskId]/route.ts`
- [ ] `app/api/tasks/[taskId]/run/route.ts`
- [ ] `app/api/tasks/[taskId]/confirm/route.ts`
- [ ] `app/api/scan/route.ts`
- [ ] `app/api/scan/[scanId]/route.ts`
- [ ] `app/api/scan/[scanId]/actions/[actionId]/route.ts`
- [ ] `app/api/chat/route.ts`
- [ ] `app/api/debug/oauth/route.ts`

---

## Phase 4: Client-Side Implementation

### 4.1 Create Native Auth Hook

- [ ] Create `hooks/useNativeAuth.ts`

```typescript
'use client';

import { useState, useCallback, useEffect } from 'react';
import { isNativePlatform } from '@/lib/utils/platform';

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
      const session: MobileSession = JSON.parse(saved);
      if (session.expiresAt > Date.now()) {
        setMobileUser(session.user);
      } else {
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
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');

      const result = await GoogleAuth.signIn();

      if (!result.authentication?.idToken) {
        throw new Error('No ID token received');
      }

      const response = await fetch('/api/auth/mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: result.authentication.idToken,
          accessToken: result.authentication.accessToken,
          refreshToken: result.authentication.refreshToken,
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
        await fetch('/api/auth/mobile/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        });
      }

      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.signOut();
      localStorage.removeItem(STORAGE_KEY);
      setMobileUser(null);
    } catch (err) {
      console.error('Native sign-out error:', err);
    }
  }, []);

  const getAuthHeader = useCallback((): Record<string, string> => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const session: MobileSession = JSON.parse(saved);
      return { Authorization: `Bearer ${session.token}` };
    }
    return {};
  }, []);

  return { signInNative, signOutNative, getAuthHeader, mobileUser, isLoading, error };
}
```

### 4.2 Update AuthProvider

- [ ] Update `components/AuthProvider.tsx`

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { isNativePlatform } from '@/lib/utils/platform';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize Google Auth plugin on native platforms
  useEffect(() => {
    if (isNativePlatform()) {
      import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
        GoogleAuth.initialize();
      });
    }
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
```

### 4.3 Update LoginScreen

- [ ] Update `components/LoginScreen.tsx` to use hybrid auth

Add imports:
```typescript
import { useNativeAuth } from '@/hooks/useNativeAuth';
import { isNativePlatform } from '@/lib/utils/platform';
```

Update sign-in handler:
```typescript
const { signInNative, isLoading, error } = useNativeAuth();

const handleSignIn = async () => {
  if (isNativePlatform()) {
    const user = await signInNative();
    if (user) {
      router.push('/');
      router.refresh();
    }
  } else {
    signIn('google', { callbackUrl: '/' });
  }
};
```

Add error display and loading state to button.

---

## Phase 5: Capacitor & iOS Configuration

### 5.1 Update Capacitor Config

- [ ] Update `capacitor.config.ts`

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todone.app',
  appName: 'Todone',
  webDir: 'out',

  server: {
    url: 'https://todone-dusky.vercel.app',
    allowNavigation: ['accounts.google.com', '*.google.com'],
  },

  plugins: {
    GoogleAuth: {
      scopes: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/contacts.readonly',
      ],
      iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',  // <-- REPLACE
      serverClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // <-- REPLACE (existing GOOGLE_CLIENT_ID)
      forceCodeForRefreshToken: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },

  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
```

### 5.2 Update iOS Info.plist

- [ ] Update `ios/App/App/Info.plist` - add inside `<dict>`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID</string>
    </array>
  </dict>
</array>

<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>

<key>LSApplicationQueriesSchemes</key>
<array>
  <string>googlechrome</string>
  <string>googlegmail</string>
</array>
```

### 5.3 Sync iOS Project

- [ ] Run: `npx cap sync ios`
- [ ] Run: `npx cap open ios`

---

## Phase 6: Testing & Verification

### 6.1 Deploy & Build

- [ ] Deploy to Vercel (API endpoints)
- [ ] Build iOS app in Xcode

### 6.2 Test Native Sign-In Flow

- [ ] Tap "Continue with Google" on iOS
- [ ] Verify native Google Sign-In sheet appears
- [ ] Complete sign-in
- [ ] Verify redirect to home page
- [ ] Verify profile created/updated in Supabase `profiles` table
- [ ] Verify tokens stored in Supabase `oauth_tokens` table

### 6.3 Test API Authentication

- [ ] Load tasks list (verify no 401 errors)
- [ ] Create a new task
- [ ] Run agent on a task
- [ ] Access Gmail/Calendar data through agent

### 6.4 Test Sign-Out

- [ ] Sign out
- [ ] Verify localStorage cleared
- [ ] Verify OAuth tokens deleted from Supabase

### 6.5 Test Web Flow (Regression)

- [ ] Sign in on web browser
- [ ] Verify NextAuth flow still works
- [ ] Verify tasks load correctly

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `lib/utils/jwt.ts` | Create | 1 |
| `lib/utils/platform.ts` | Create | 1 |
| `lib/auth/getSession.ts` | Create | 2 |
| `app/api/auth/mobile/route.ts` | Create | 2 |
| `app/api/auth/mobile/refresh/route.ts` | Create | 2 |
| `app/api/auth/mobile/logout/route.ts` | Create | 2 |
| `app/api/tasks/route.ts` | Modify | 3 |
| `app/api/tasks/[taskId]/route.ts` | Modify | 3 |
| `app/api/tasks/[taskId]/run/route.ts` | Modify | 3 |
| `app/api/tasks/[taskId]/confirm/route.ts` | Modify | 3 |
| `app/api/scan/route.ts` | Modify | 3 |
| `app/api/scan/[scanId]/route.ts` | Modify | 3 |
| `app/api/scan/[scanId]/actions/[actionId]/route.ts` | Modify | 3 |
| `app/api/chat/route.ts` | Modify | 3 |
| `app/api/debug/oauth/route.ts` | Modify | 3 |
| `hooks/useNativeAuth.ts` | Create | 4 |
| `components/AuthProvider.tsx` | Modify | 4 |
| `components/LoginScreen.tsx` | Modify | 4 |
| `capacitor.config.ts` | Modify | 5 |
| `ios/App/App/Info.plist` | Modify | 5 |

---

## Environment Variables

**New (add to Vercel):**
```
IOS_GOOGLE_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
```

**Existing (no changes needed):**
- `GOOGLE_CLIENT_ID` - web client ID
- `GOOGLE_CLIENT_SECRET` - web client secret
- `NEXTAUTH_SECRET` - reused for JWT signing
