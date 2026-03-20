import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'auth_token';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

// JWT 密钥 — 从环境变量获取，fallback 用 COOKIE_SECRET
function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET || 'xiaojingzi-jwt-secret';
  return new TextEncoder().encode(secret);
}

export interface AuthUser {
  userId: string;
  phone: string;
  displayName?: string;
}

/**
 * 签发 JWT token 并写入 cookie
 */
export async function signIn(user: AuthUser): Promise<string> {
  const token = await new SignJWT({
    userId: user.userId,
    phone: user.phone,
    displayName: user.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });

  return token;
}

/**
 * 从 cookie 中读取并验证 JWT，返回用户信息
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.userId || !payload.phone) return null;

    return {
      userId: payload.userId as string,
      phone: payload.phone as string,
      displayName: payload.displayName as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 登出 — 清除 auth cookie
 */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * 获取当前身份 — userId 优先，fallback 到 guestId
 */
export async function getCurrentIdentity(): Promise<{
  userId?: string;
  guestId?: string;
  isAuthenticated: boolean;
}> {
  const user = await getAuthUser();
  if (user) {
    return { userId: user.userId, isAuthenticated: true };
  }

  // fallback 到 guest_id
  const cookieStore = await cookies();
  const guestId = cookieStore.get('guest_id')?.value;
  return { guestId, isAuthenticated: false };
}
