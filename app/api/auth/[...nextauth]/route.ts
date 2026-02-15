import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '@/lib/utils/encryption';
import { revokeTokens, GOOGLE_SCOPES } from '@/lib/google/auth';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: ['openid', ...GOOGLE_SCOPES].join(' '),
          access_type: 'offline',  // Required to get refresh_token
          prompt: 'consent',       // Force consent to always get refresh_token
        },
      },
    }),
  ],
  // Cookie configuration for Capacitor WebView compatibility
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Required for Capacitor WebView
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      console.log('NextAuth signIn callback, provider:', account?.provider);

      if (account?.provider === 'google') {
        try {
          // Check if profile already exists
          const { data: existingProfile, error: selectError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', user.email)
            .single();

          console.log('Existing profile check:', { exists: !!existingProfile, error: selectError?.message });

          let profileId: string;

          if (existingProfile) {
            profileId = existingProfile.id;
            // Update existing profile
            await supabaseAdmin
              .from('profiles')
              .update({
                full_name: user.name,
                avatar_url: user.image,
                updated_at: new Date().toISOString(),
              })
              .eq('id', profileId);
          } else {
            // Create new profile with generated UUID
            profileId = uuidv4();
            console.log('Creating new profile with ID:', profileId);

            const { data: insertData, error: insertError } = await supabaseAdmin
              .from('profiles')
              .insert({
                id: profileId,
                email: user.email,
                full_name: user.name,
                avatar_url: user.image,
              })
              .select();

            console.log('Insert result:', { insertData, insertError: insertError?.message, insertErrorDetails: insertError });

            if (insertError) {
              console.error('Error creating profile:', insertError);
              // Try to continue anyway - profile might already exist
            }
          }

          // Store OAuth tokens (SECURITY: encrypted at rest)
          if (account.access_token) {
            // Encrypt tokens before storing
            const encryptedAccessToken = await encrypt(account.access_token);
            const encryptedRefreshToken = account.refresh_token
              ? await encrypt(account.refresh_token)
              : null;

            const { error: tokenError } = await supabaseAdmin
              .from('oauth_tokens')
              .upsert({
                user_id: profileId,
                provider: 'google',
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                access_token_expires_at: account.expires_at
                  ? new Date(account.expires_at * 1000).toISOString()
                  : new Date(Date.now() + 3600 * 1000).toISOString(),
                scopes: account.scope ? account.scope.split(' ') : [],
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id,provider' });

            if (tokenError) {
              console.error('Error storing OAuth tokens:', tokenError);
            }
          }
        } catch (error) {
          console.error('Error in signIn callback:', error);
          // Still allow sign in even if Supabase storage fails
        }
      }
      return true;
    },
    async session({ session }) {
      // Attach user ID from profiles table to session
      if (session?.user?.email) {
        const { data: profileData } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', session.user.email)
          .single();

        if (profileData) {
          (session.user as any).id = profileData.id;
        }
      }
      return session;
    },
  },
  events: {
    // SECURITY: Revoke tokens on sign out
    async signOut(message) {
      // message can be { session } or { token } depending on session strategy
      const session = 'session' in message ? message.session : null;
      if (session?.user?.email) {
        try {
          const { data: profileData } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', session.user.email)
            .single();

          if (profileData) {
            // Revoke tokens with Google and delete from database
            await revokeTokens(profileData.id);
            console.log('Tokens revoked for user');
          }
        } catch (error) {
          console.error('Error revoking tokens on sign out:', error);
          // Don't block sign out if revocation fails
        }
      }
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
