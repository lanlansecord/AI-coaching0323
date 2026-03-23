import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAIClient, getModel } from '@/lib/ai/client';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import type { EntryTag } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTEXT_MESSAGE_LIMIT = 12;
const CONTEXT_CHAR_LIMIT = 6000;
const RECENT_HISTORY_FETCH_LIMIT = 24;

function buildRecentContext(history: { role: string; content: string }[]) {
  const selected: { role: 'user' | 'assistant'; content: string }[] = [];
  let totalChars = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const content = message.content.trim();
    if (!content) continue;

    const nextTotalChars = totalChars + content.length;
    const hasMinimumContext = selected.length >= 4;

    if (selected.length >= CONTEXT_MESSAGE_LIMIT) break;
    if (hasMinimumContext && nextTotalChars > CONTEXT_CHAR_LIMIT) break;

    selected.unshift({
      role: message.role as 'user' | 'assistant',
      content,
    });
    totalChars = nextTotalChars;
  }

  return selected;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const body = await request.json();
    const userMessage = body.message?.trim();
    const inputMode = body.inputMode === 'voice' ? 'voice' : 'text';

    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [sessionResult, recentHistory] = await Promise.all([
      db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1),
      db
        .select({
          role: messages.role,
          content: messages.content,
        })
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(desc(messages.createdAt))
        .limit(RECENT_HISTORY_FETCH_LIMIT),
    ]);
    const [session] = sessionResult;

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save user message
    await db.insert(messages).values({
      sessionId,
      role: 'user',
      content: userMessage,
      inputMode,
    });

    // Build messages for AI
    const tag = session.entryTag === 'general' ? null : (session.entryTag as EntryTag);
    const systemPrompt = buildSystemPrompt(tag);
    const contextMessages = buildRecentContext([...recentHistory].reverse());
    const aiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      { role: 'user', content: userMessage },
    ];

    // Stream AI response
    const client = getAIClient();
    let stream;
    try {
      stream = await client.chat.completions.create({
        model: getModel(),
        messages: aiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 500,
      });
    } catch (aiError) {
      console.error('AI API error:', aiError);
      return new Response(
        JSON.stringify({ error: 'AI service unavailable', detail: String(aiError) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }

          // Save assistant message after streaming completes
          await db.insert(messages).values({
            sessionId,
            role: 'assistant',
            content: fullResponse,
          });

          // Update last_message_at
          await db
            .update(sessions)
            .set({ lastMessageAt: new Date() })
            .where(eq(sessions.id, sessionId));

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'AI response failed' })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
