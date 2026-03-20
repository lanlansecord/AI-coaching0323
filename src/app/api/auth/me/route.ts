import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getGuestId } from '@/lib/guest';

/**
 * GET /api/auth/me
 * 返回当前用户信息（已登录）或匿名状态
 */
export async function GET() {
  try {
    const user = await getAuthUser();

    if (user) {
      return NextResponse.json({
        isAuthenticated: true,
        user: {
          id: user.userId,
          phone: user.phone,
          displayName: user.displayName,
        },
      });
    }

    const guestId = await getGuestId();
    return NextResponse.json({
      isAuthenticated: false,
      guestId: guestId || null,
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      { isAuthenticated: false, guestId: null },
    );
  }
}
