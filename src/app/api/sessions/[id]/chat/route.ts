import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAIClient, getModel } from '@/lib/ai/client';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import type { EntryTag } from '@/types';

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

    // Get session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

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

    // Get message history
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    // Build messages for AI
    const tag = session.entryTag === 'general' ? null : (session.entryTag as EntryTag);
    const systemPrompt = buildSystemPrompt(tag);
    const aiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
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
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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
