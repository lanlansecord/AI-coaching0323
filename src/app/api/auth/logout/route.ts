import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

/**
 * POST /api/auth/logout
 * 登出 — 清除 auth cookie
 */
export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: true }); // 即使出错也清除
  }
}
