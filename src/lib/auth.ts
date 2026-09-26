import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || 'remo_super_secret_jwt_key_2026_secure'
);

export interface TokenPayload {
  userId: number;
  email: string;
  name: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload as unknown as TokenPayload;
  } catch (err) {
    return null;
  }
}

export async function getCurrentUser(): Promise<TokenPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get('remo_auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}
