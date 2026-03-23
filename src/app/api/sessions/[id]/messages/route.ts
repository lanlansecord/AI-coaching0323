import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { ensureVoiceMessageColumns } from '@/lib/db/ensure-voice-message-columns';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    await ensureVoiceMessageColumns();

    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({
      messages: allMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        inputMode: m.inputMode,
        audioUrl: m.audioUrl,
        audioDurationMs: m.audioDurationMs,
      })),
    });
  } catch (error) {
    console.error('Messages fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;

  try {
    const body = (await request.json()) as {
      role?: string;
      content?: string;
      inputMode?: string;
      audioUrl?: string;
      audioDurationMs?: number;
    };

    if (!body.role || !body.content?.trim()) {
      return NextResponse.json(
        { error: 'role and content are required' },
        { status: 400 }
      );
    }

    if (body.role !== 'user' && body.role !== 'assistant') {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }

    await ensureVoiceMessageColumns();

    const [message] = await db
      .insert(messages)
      .values({
        sessionId,
        role: body.role,
        content: body.content.trim(),
        inputMode: body.inputMode === 'voice' ? 'voice' : 'text',
        audioUrl: body.inputMode === 'voice' && typeof body.audioUrl === 'string' ? body.audioUrl : null,
        audioDurationMs:
          body.inputMode === 'voice' && typeof body.audioDurationMs === 'number'
            ? Math.max(0, Math.round(body.audioDurationMs))
            : null,
      })
      .returning();

    return NextResponse.json({
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        inputMode: message.inputMode,
        audioUrl: message.audioUrl,
        audioDurationMs: message.audioDurationMs,
      },
    });
  } catch (error) {
    console.error('Message create error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
