import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { getOrCreateGuestId, getGuestId } from '@/lib/guest';
import { OPENING_MESSAGES, DEFAULT_OPENING } from '@/lib/ai/prompts';
import { eq, desc, count, sql } from 'drizzle-orm';
import type { EntryTag } from '@/types';

const VALID_TAGS: EntryTag[] = ['clarity', 'emotion', 'procrastination'];

/**
 * GET /api/sessions — 获取当前用户的所有对话记录
 */
export async function GET() {
  try {
    const guestId = await getGuestId();
    if (!guestId) {
      return NextResponse.json({ sessions: [] });
    }

    // 查询该用户的所有会话，按创建时间倒序
    const allSessions = await db
      .select({
        id: sessions.id,
        entryTag: sessions.entryTag,
        mode: sessions.mode,
        status: sessions.status,
        createdAt: sessions.createdAt,
        lastMessageAt: sessions.lastMessageAt,
        summaryJson: sessions.summaryJson,
      })
      .from(sessions)
      .where(eq(sessions.guestId, guestId))
      .orderBy(desc(sessions.createdAt));

    // 获取每个会话的消息数和第一条用户消息作为预览
    const sessionsWithPreview = await Promise.all(
      allSessions.map(async (session) => {
        // 消息数
        const [msgCount] = await db
          .select({ count: count() })
          .from(messages)
          .where(eq(messages.sessionId, session.id));

        // 第一条用户消息作为预览
        const firstUserMsg = await db
          .select({ content: messages.content })
          .from(messages)
          .where(
            sql`${messages.sessionId} = ${session.id} AND ${messages.role} = 'user'`
          )
          .orderBy(messages.createdAt)
          .limit(1);

        const preview = firstUserMsg[0]?.content || '';

        return {
          ...session,
          messageCount: msgCount.count,
          preview: preview.length > 80 ? preview.slice(0, 80) + '...' : preview,
        };
      })
    );

    return NextResponse.json({ sessions: sessionsWithPreview });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entryTag = body.entryTag as EntryTag | undefined;

    // Tag is optional — validate only if provided
    if (entryTag && !VALID_TAGS.includes(entryTag)) {
      return NextResponse.json(
        { error: 'Invalid entry tag' },
        { status: 400 }
      );
    }

    const guestId = await getOrCreateGuestId();
    const openingMessage = entryTag
      ? OPENING_MESSAGES[entryTag]
      : DEFAULT_OPENING;

    // Create session (entryTag can be null)
    const [session] = await db
      .insert(sessions)
      .values({
        guestId,
        entryTag: entryTag || 'general',
        status: 'active',
      })
      .returning();

    // Insert opening assistant message
    await db.insert(messages).values({
      sessionId: session.id,
      role: 'assistant',
      content: openingMessage,
    });

    return NextResponse.json({
      sessionId: session.id,
      firstMessage: openingMessage,
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
