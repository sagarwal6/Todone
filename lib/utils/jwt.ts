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
