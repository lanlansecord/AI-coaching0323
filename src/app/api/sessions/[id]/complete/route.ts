import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAIClient, getModel } from '@/lib/ai/client';
import { buildSummaryPrompt } from '@/lib/ai/summary';
import type { EntryTag } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const mode = body.mode === 'voice' ? 'voice' : 'text';
    const voiceDurationMs =
      typeof body.voiceDurationMs === 'number' ? body.voiceDurationMs : null;
    const voiceTurnCount =
      typeof body.voiceTurnCount === 'number' ? body.voiceTurnCount : null;
    const interruptCount =
      typeof body.interruptCount === 'number' ? body.interruptCount : null;
    const firstResponseLatencyMs =
      typeof body.firstResponseLatencyMs === 'number'
        ? body.firstResponseLatencyMs
        : null;

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

    // 自动生成标题：用 AI 基于对话内容生成简短标题
    let title = '';
    try {
      const TAG_CN: Record<string, string> = {
        clarity: '理清思路',
        emotion: '梳理情绪',
        procrastination: '走出拖延',
        general: '自由对话',
      };
      const tagLabel = TAG_CN[session.entryTag] || '自由对话';
      const titleCompletion = await client.chat.completions.create({
        model: getModel(),
        messages: [{
          role: 'user',
          content: `请根据以下对话内容，生成一个简短的对话标题（10字以内），格式为"${tagLabel}-具体主题"。只输出标题本身，不要加引号或其他内容。\n\n${conversationText.slice(0, 1000)}`,
        }],
        temperature: 0.3,
        max_tokens: 50,
      });
      title = titleCompletion.choices[0]?.message?.content?.trim() || '';
      // 如果 AI 没按格式来，手动拼
      if (title && !title.startsWith(tagLabel)) {
        title = `${tagLabel}-${title}`;
      }
    } catch {
      // 标题生成失败不影响主流程
    }

    // Save summary, title, and mark completed
    await db
      .update(sessions)
      .set({
        mode,
        summaryJson,
        title: title || null,
        status: 'completed',
        voiceDurationMs,
        voiceTurnCount,
        interruptCount,
        firstResponseLatencyMs,
        endedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({ summary: summaryJson, title });
  } catch (error) {
    console.error('Complete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
