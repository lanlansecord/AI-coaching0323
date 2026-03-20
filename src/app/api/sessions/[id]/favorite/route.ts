import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/sessions/[id]/favorite
 * Body: { isFavorite: boolean }
 * 收藏或取消收藏
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { isFavorite } = await request.json();

    await db
      .update(sessions)
      .set({ isFavorite: !!isFavorite })
      .where(eq(sessions.id, id));

    return NextResponse.json({ success: true, isFavorite: !!isFavorite });
  } catch (error) {
    console.error('Favorite error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
