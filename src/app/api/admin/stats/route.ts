import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sessions, messages, feedback } from '@/lib/db/schema';
import { sql, count, avg, countDistinct, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  // 密码验证
  const password = request.headers.get('x-admin-password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // 总对话数
  const [totalSessions] = await db
    .select({ count: count() })
    .from(sessions);

  // 按模式统计
  const modeStats = await db
    .select({
      mode: sessions.mode,
      count: count(),
    })
    .from(sessions)
    .groupBy(sessions.mode);

  // 按标签统计
  const tagStats = await db
    .select({
      tag: sessions.entryTag,
      count: count(),
    })
    .from(sessions)
    .groupBy(sessions.entryTag);

  // 今日对话数（UTC）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todaySessions] = await db
    .select({ count: count() })
    .from(sessions)
    .where(sql`${sessions.createdAt} >= ${today.toISOString()}`);

  // 独立用户数
  const [uniqueGuests] = await db
    .select({ count: countDistinct(sessions.guestId) })
    .from(sessions);

  // 今日独立用户
  const [todayGuests] = await db
    .select({ count: countDistinct(sessions.guestId) })
    .from(sessions)
    .where(sql`${sessions.createdAt} >= ${today.toISOString()}`);

  // 平均消息数
  const msgCounts = await db
    .select({
      sessionId: messages.sessionId,
      count: count(),
    })
    .from(messages)
    .groupBy(messages.sessionId);
  const avgMsgCount = msgCounts.length > 0
    ? Math.round(msgCounts.reduce((sum, r) => sum + Number(r.count), 0) / msgCounts.length)
    : 0;

  // 反馈平均分
  const [feedbackAvg] = await db
    .select({
      avgHeard: avg(feedback.feltHeardScore),
      avgClearer: avg(feedback.gotClearerScore),
      avgReturn: avg(feedback.returnIntentScore),
      count: count(),
    })
    .from(feedback)
    .where(sql`${feedback.feltHeardScore} IS NOT NULL`);

  // 完成状态统计
  const statusStats = await db
    .select({
      status: sessions.status,
      count: count(),
    })
    .from(sessions)
    .groupBy(sessions.status);

  return NextResponse.json({
    totalSessions: Number(totalSessions.count),
    todaySessions: Number(todaySessions.count),
    uniqueGuests: Number(uniqueGuests.count),
    todayGuests: Number(todayGuests.count),
    avgMsgCount,
    modeStats: Object.fromEntries(modeStats.map(r => [r.mode, Number(r.count)])),
    tagStats: Object.fromEntries(tagStats.map(r => [r.tag, Number(r.count)])),
    statusStats: Object.fromEntries(statusStats.map(r => [r.status, Number(r.count)])),
    feedbackAvg: feedbackAvg.count > 0 ? {
      heard: Number(Number(feedbackAvg.avgHeard).toFixed(1)),
      clearer: Number(Number(feedbackAvg.avgClearer).toFixed(1)),
      returnIntent: Number(Number(feedbackAvg.avgReturn).toFixed(1)),
      count: Number(feedbackAvg.count),
    } : null,
  });
}
