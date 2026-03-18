import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sessions, messages, feedback } from '@/lib/db/schema';
import { desc, eq, count, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const password = request.headers.get('x-admin-password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const mode = searchParams.get('mode'); // 'text' | 'voice' | null
  const tag = searchParams.get('tag'); // entry tag filter
  const offset = (page - 1) * limit;

  const db = getDb();

  // Build conditions
  const conditions = [];
  if (mode) conditions.push(eq(sessions.mode, mode));
  if (tag) conditions.push(eq(sessions.entryTag, tag));

  const where = conditions.length > 0
    ? sql`${sql.join(conditions.map(c => sql`${c}`), sql` AND `)}`
    : undefined;

  // Get sessions with message count
  const result = await db
    .select({
      id: sessions.id,
      guestId: sessions.guestId,
      entryTag: sessions.entryTag,
      mode: sessions.mode,
      status: sessions.status,
      completionReason: sessions.completionReason,
      aiModel: sessions.aiModel,
      promptVersion: sessions.promptVersion,
      createdAt: sessions.createdAt,
      endedAt: sessions.endedAt,
      voiceDurationMs: sessions.voiceDurationMs,
      voiceTurnCount: sessions.voiceTurnCount,
    })
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.createdAt))
    .limit(limit)
    .offset(offset);

  // Get message counts for these sessions
  const sessionIds = result.map(s => s.id);
  let msgCounts: Record<string, number> = {};
  if (sessionIds.length > 0) {
    const counts = await db
      .select({
        sessionId: messages.sessionId,
        count: count(),
      })
      .from(messages)
      .where(sql`${messages.sessionId} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(messages.sessionId);
    msgCounts = Object.fromEntries(counts.map(c => [c.sessionId, Number(c.count)]));
  }

  // Get feedback for these sessions
  let feedbackMap: Record<string, { heard: number | null; clearer: number | null; returnIntent: number | null; text: string | null }> = {};
  if (sessionIds.length > 0) {
    const fbs = await db
      .select({
        sessionId: feedback.sessionId,
        feltHeardScore: feedback.feltHeardScore,
        gotClearerScore: feedback.gotClearerScore,
        returnIntentScore: feedback.returnIntentScore,
        freeTextFeedback: feedback.freeTextFeedback,
      })
      .from(feedback)
      .where(sql`${feedback.sessionId} IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`);
    feedbackMap = Object.fromEntries(fbs.map(f => [f.sessionId, {
      heard: f.feltHeardScore,
      clearer: f.gotClearerScore,
      returnIntent: f.returnIntentScore,
      text: f.freeTextFeedback,
    }]));
  }

  // Total count
  const [total] = await db
    .select({ count: count() })
    .from(sessions)
    .where(where);

  return NextResponse.json({
    sessions: result.map(s => ({
      ...s,
      messageCount: msgCounts[s.id] || 0,
      feedback: feedbackMap[s.id] || null,
    })),
    total: Number(total.count),
    page,
    limit,
  });
}
