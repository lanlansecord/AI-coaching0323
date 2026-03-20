import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { getOrCreateGuestId, getGuestId } from '@/lib/guest';
import { getAuthUser } from '@/lib/auth';
import { OPENING_MESSAGES, DEFAULT_OPENING } from '@/lib/ai/prompts';
import { eq, desc, count, sql, or } from 'drizzle-orm';
import type { EntryTag } from '@/types';

const VALID_TAGS: EntryTag[] = ['clarity', 'emotion', 'procrastination'];

/**
 * GET /api/sessions — 获取当前用户的所有对话记录
 * 已登录用户：按 userId 查询（含迁移过来的）
 * 匿名用户：按 guestId 查询
 */
export async function GET() {
  try {
    const authUser = await getAuthUser();
    const guestId = await getGuestId();

    if (!authUser && !guestId) {
      return NextResponse.json({ sessions: [] });
    }

    // 构建查询条件：userId 或 guestId
    const whereCondition = authUser
      ? or(eq(sessions.userId, authUser.userId), guestId ? eq(sessions.guestId, guestId) : undefined)
      : guestId ? eq(sessions.guestId, guestId) : undefined;

    if (!whereCondition) {
      return NextResponse.json({ sessions: [] });
    }

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
      .where(whereCondition)
      .orderBy(desc(sessions.createdAt));

    const sessionsWithPreview = await Promise.all(
      allSessions.map(async (session) => {
        const [msgCount] = await db
          .select({ count: count() })
          .from(messages)
          .where(eq(messages.sessionId, session.id));

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

/**
 * POST /api/sessions — 创建新对话
 * 已登录用户：关联 userId
 * 匿名用户：仅用 guestId
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entryTag = body.entryTag as EntryTag | undefined;

    if (entryTag && !VALID_TAGS.includes(entryTag)) {
      return NextResponse.json(
        { error: 'Invalid entry tag' },
        { status: 400 }
      );
    }

    const guestId = await getOrCreateGuestId();
    const authUser = await getAuthUser();

    const openingMessage = entryTag
      ? OPENING_MESSAGES[entryTag]
      : DEFAULT_OPENING;

    const [session] = await db
      .insert(sessions)
      .values({
        guestId,
        userId: authUser?.userId || null,
        entryTag: entryTag || 'general',
        status: 'active',
      })
      .returning();

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
