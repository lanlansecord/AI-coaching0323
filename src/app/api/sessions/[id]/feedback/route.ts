import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { feedback, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const body = await request.json();
    const { helpful, highlightText, issueText } = body;

    // Verify session exists
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await db.insert(feedback).values({
      sessionId,
      helpful: helpful ?? null,
      highlightText: highlightText || null,
      issueText: issueText || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
