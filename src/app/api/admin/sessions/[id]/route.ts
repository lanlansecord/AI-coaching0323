import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sessions, messages, feedback } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const password = request.headers.get('x-admin-password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  // Get session
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get all messages
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));

  // Get feedback
  const [fb] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.sessionId, id));

  return NextResponse.json({
    session,
    messages: allMessages,
    feedback: fb || null,
  });
}
