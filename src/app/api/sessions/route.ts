import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/db/schema';
import { getOrCreateGuestId } from '@/lib/guest';
import { OPENING_MESSAGES, DEFAULT_OPENING } from '@/lib/ai/prompts';
import type { EntryTag } from '@/types';

const VALID_TAGS: EntryTag[] = ['clarity', 'emotion', 'procrastination'];

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
