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
