import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages, feedback } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * DELETE /api/sessions/[id]/delete
 * 删除对话及其所有消息和反馈
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 先删子表，再删主表
    await db.delete(feedback).where(eq(feedback.sessionId, id));
    await db.delete(messages).where(eq(messages.sessionId, id));
    await db.delete(sessions).where(eq(sessions.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
