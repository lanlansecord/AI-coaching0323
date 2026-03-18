import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAIClient, getModel } from '@/lib/ai/client';
import { buildSummaryPrompt } from '@/lib/ai/summary';
import type { EntryTag } from '@/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    // Get session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed' && session.summaryJson) {
      return NextResponse.json({ summary: session.summaryJson });
    }

    // Get all messages
    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    // Build conversation text
    const conversationText = allMessages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '用户' : '小镜子'}：${m.content}`)
      .join('\n\n');

    // Generate summary
    const summaryPrompt = buildSummaryPrompt(
      session.entryTag as EntryTag,
      conversationText
    );

    const client = getAIClient();
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.5,
      max_tokens: 800,
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse JSON from response
    let summaryJson;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryJson = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback summary
      summaryJson = {
        blocks: [
          { key: 'block_1', title: '对话摘要', content: '对话内容已记录。' },
          { key: 'block_2', title: '关键发现', content: '请回顾对话获取更多洞察。' },
          { key: 'block_3', title: '下一步', content: '继续探索和反思。' },
        ],
      };
    }

    // Save summary and mark completed
    await db
      .update(sessions)
      .set({
        summaryJson,
        status: 'completed',
      })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({ summary: summaryJson });
  } catch (error) {
    console.error('Complete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
