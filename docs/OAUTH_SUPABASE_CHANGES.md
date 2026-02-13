# OAuth & Supabase Implementation for Todone

## Session Summary

This document captures all work done toward implementing Google OAuth authentication with Supabase for Todone. The OAuth integration was completed but then **temporarily disabled** to allow for demos. All the OAuth code exists but is not wired up.

---

## Current State: OAuth DISABLED

The app currently runs without authentication. To re-enable OAuth, see the "Re-enabling OAuth" section below.

---

## What Was Completed

### 1. Dependencies Installed

```bash
npm install next-auth @supabase/supabase-js
```

Both packages are in `package.json` and ready to use.

### 2. New Files Created

All these files exist and are functional, just not integrated into the main app flow:

#### `/lib/supabase.ts`
Server-side Supabase admin client for storing users and OAuth tokens.

```typescript
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key
// This should only be used in server-side code (API routes, server components)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

#### `/app/api/auth/[...nextauth]/route.ts`
NextAuth configuration with Google OAuth provider. This handler:
- Authenticates users via Google OAuth
- Upserts user data to Supabase `users` table on sign-in
- Stores OAuth tokens (access_token, refresh_token) in `oauth_tokens` table
- Tokens are stored for future Gmail/Calendar API access

```typescript
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        try {
          // Upsert user in Supabase
          await supabaseAdmin
            .from('users')
            .upsert({
              email: user.email,
              name: user.name,
              image: user.image,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'email' });

          // Store OAuth tokens for future Gmail/Calendar access
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single();

          if (userData && account.access_token) {
            await supabaseAdmin
              .from('oauth_tokens')
              .upsert({
                user_id: userData.id,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at
                  ? new Date(account.expires_at * 1000).toISOString()
                  : null,
                scope: account.scope,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });
          }
        } catch (error) {
          console.error('Error storing user/tokens in Supabase:', error);
          // Still allow sign in even if Supabase storage fails
        }
      }
      return true;
    },
    async session({ session }) {
      return session;
    },
  },
});

export { handler as GET, handler as POST };
```

#### `/components/AuthProvider.tsx`
Client-side SessionProvider wrapper for NextAuth.

```typescript
'use client';

import { SessionProvider } from 'next-auth/react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

#### `/components/LoginScreen.tsx`
Full-screen login UI with Google sign-in button. Matches the inbox-style design of the app.

Features:
- App branding with Todone logo
- "Continue with Google" button with official Google icon
- Clean, minimal design
- Uses `signIn('google', { callbackUrl: '/' })` from next-auth/react

#### `/.env.local.example`
Updated with all required environment variables:

```bash
# Gemini API (for AI research features)
GEMINI_API_KEY=your_gemini_api_key_here

# Google OAuth
# Get these from console.cloud.google.com > APIs & Services > Credentials
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32

# Supabase
# Get these from your Supabase project settings > API
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## Files That Need Modification to Re-enable OAuth

### `/app/layout.tsx`

**Current state:** No AuthProvider wrapping

**To re-enable:** Add AuthProvider import and wrap children:

```typescript
// Add import
import { AuthProvider } from "@/components/AuthProvider";

// In the return, wrap children:
<body className="antialiased min-h-screen bg-surface text-on-surface font-sans">
  <AuthProvider>
    {children}
  </AuthProvider>
</body>
```

### `/app/page.tsx`

**Current state:** No auth checking

**To re-enable:** Add these changes:

1. Add imports:
```typescript
import { useCallback, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { LoginScreen } from '@/components/LoginScreen';
import { getRemainingRequests, setCurrentUser } from '@/lib/storage';
```

2. Add at start of Home component:
```typescript
export default function Home() {
  const { data: session, status } = useSession();
  const userEmail = session?.user?.email || null;

  // Set current user for storage scoping
  useEffect(() => {
    setCurrentUser(userEmail);
  }, [userEmail]);

  // ... rest of useTasks destructuring, add refreshTasks:
  const { ..., refreshTasks } = useTasks();

  // Refresh tasks when user changes
  useEffect(() => {
    if (userEmail) {
      refreshTasks();
    }
  }, [userEmail, refreshTasks]);
```

3. Add auth gate before the mobile/desktop layout returns:
```typescript
  // Show loading state while checking auth
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-inbox-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-inbox-accent-light mb-4 animate-pulse">
            <MaterialIcon name="task_alt" size={36} className="text-inbox-accent" fill />
          </div>
          <p className="text-inbox-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!session) {
    return <LoginScreen />;
  }
```

### `/lib/storage.ts`

**Current state:** Uses default user ID for all storage

**To re-enable user-scoped storage:** Replace the top section:

```typescript
import { Task, RateLimitInfo, StorageData } from './types';

const STORAGE_KEY = 'todone:tasks';
const RATE_LIMIT_KEY = 'todone:ratelimit';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Current user email for storage scoping
let currentUserEmail: string | null = null;

/**
 * Set the current user for storage scoping.
 * Call this when the user logs in/out.
 */
export function setCurrentUser(email: string | null): void {
  currentUserEmail = email;
}

/**
 * Get the current user email
 */
export function getCurrentUser(): string | null {
  return currentUserEmail;
}

function getStorageKey(key: string): string {
  // Use email if available, otherwise 'anonymous'
  const userId = currentUserEmail || 'anonymous';
  return `${key}:${userId}`;
}
```

---

## Supabase Setup Required

### Database Schema

Run this SQL in Supabase SQL Editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens table (for future Gmail/Calendar)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by NextAuth callback)
CREATE POLICY "Service role access" ON users FOR ALL USING (true);
CREATE POLICY "Service role access" ON oauth_tokens FOR ALL USING (true);
```

---

## Google Cloud Console Setup

1. Go to console.cloud.google.com
2. Create or select a project
3. Go to **APIs & Services** → **OAuth consent screen**
   - User type: External
   - Add scopes: `email`, `profile`, `openid`
   - For Gmail/Calendar later, add: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`
   - Add test users (your email)
4. Go to **Credentials** → **Create OAuth client ID**
   - Type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
   - Copy Client ID and Client Secret to `.env.local`

---

## Phase 2: Gmail & Calendar Integration (NOT STARTED)

### Architecture Plan

Once OAuth is working, Phase 2 adds:

1. **Expand OAuth Scopes** - Update Google provider config:
```typescript
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorization: {
    params: {
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'offline',
      prompt: 'consent',
    },
  },
}),
```

2. **Gmail API Integration**
   - Create `/lib/gmail.ts` - Gmail API client
   - Create `/app/api/gmail/route.ts` - API endpoint to fetch emails
   - Features: List recent emails, search emails, get email details
   - Use stored `access_token` from Supabase `oauth_tokens` table

3. **Calendar API Integration**
   - Create `/lib/calendar.ts` - Calendar API client
   - Create `/app/api/calendar/route.ts` - API endpoint to fetch events
   - Features: List upcoming events, get event details

4. **Token Refresh Logic**
   - Check `expires_at` before API calls
   - Use `refresh_token` to get new `access_token` when expired
   - Update tokens in Supabase

5. **UI Components**
   - Email suggestion panel (actionable emails as tasks)
   - Calendar event panel (upcoming meetings/deadlines)
   - Settings UI for toggling integrations

### Gmail API Example Code

```typescript
// lib/gmail.ts
import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';

export async function getGmailClient(userEmail: string) {
  // Get user's tokens from Supabase
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .single();

  const { data: tokens } = await supabaseAdmin
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function getRecentEmails(userEmail: string, maxResults = 10) {
  const gmail = await getGmailClient(userEmail);

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'is:unread', // Optional: only unread
  });

  return response.data.messages;
}
```

### Calendar API Example Code

```typescript
// lib/calendar.ts
import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';

export async function getCalendarClient(userEmail: string) {
  // Similar to Gmail - get tokens and create client
  // ...
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export async function getUpcomingEvents(userEmail: string, maxResults = 10) {
  const calendar = await getCalendarClient(userEmail);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items;
}
```

### Additional Dependencies for Phase 2

```bash
npm install googleapis
```

---

## Verification Checklist

When re-enabling OAuth, verify:

1. [ ] **Login Flow**: Click "Continue with Google" → redirects to Google → returns authenticated
2. [ ] **Session Persistence**: Refresh page → still logged in
3. [ ] **User in Supabase**: Check `users` table has your email/name/image
4. [ ] **Tokens Stored**: Check `oauth_tokens` table has access/refresh tokens
5. [ ] **User-Scoped Storage**: Add task → check localStorage key includes email (e.g., `todone:tasks:user@gmail.com`)
6. [ ] **Logout**: Sign out → returns to login screen
7. [ ] **Build**: `npm run build` succeeds without errors

---

## File Tree of OAuth-Related Files

```
Todone/
├── .env.local.example          # Updated with OAuth/Supabase vars
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts    # NextAuth handler (EXISTS)
│   ├── layout.tsx              # Needs AuthProvider wrapping
│   └── page.tsx                # Needs auth gate
├── components/
│   ├── AuthProvider.tsx        # SessionProvider wrapper (EXISTS)
│   └── LoginScreen.tsx         # Google sign-in UI (EXISTS)
├── lib/
│   ├── supabase.ts             # Supabase admin client (EXISTS)
│   └── storage.ts              # Needs user-scoping changes
└── hooks/
    └── useTasks.ts             # Works as-is, just needs refreshTasks called on user change
```

---

## Quick Start Commands

```bash
# Install dependencies (already done)
npm install next-auth @supabase/supabase-js

# For Phase 2 Gmail/Calendar
npm install googleapis

# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Run dev server
npm run dev

# Build for production
npm run build
```

---

## Environment Variables Needed

| Variable | Source | Purpose |
|----------|--------|---------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console | OAuth client secret |
| `NEXTAUTH_URL` | Set manually | `http://localhost:3000` for dev |
| `NEXTAUTH_SECRET` | Generate with openssl | Session encryption |
| `SUPABASE_URL` | Supabase dashboard | Project URL |
| `SUPABASE_ANON_KEY` | Supabase dashboard | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard | Server-side admin key |

---

## Notes & Decisions Made

1. **NextAuth over Supabase Auth**: Using NextAuth.js for authentication because it gives us direct access to OAuth tokens (access_token, refresh_token) needed for Gmail/Calendar APIs. Supabase Auth doesn't expose these tokens.

2. **Token Storage in Supabase**: Storing OAuth tokens in Supabase (not NextAuth's built-in storage) so we can access them server-side for Gmail/Calendar API calls.

3. **User-Scoped localStorage**: Tasks remain in localStorage but scoped by user email (`todone:tasks:user@gmail.com`). This keeps the app simple while supporting multiple users.

4. **Minimal Scopes First**: Starting with just `openid`, `email`, `profile`. Gmail/Calendar scopes to be added in Phase 2.

5. **Service Role for DB Access**: Using Supabase service role key in NextAuth callback for upserting users/tokens. RLS policies allow service role full access.
