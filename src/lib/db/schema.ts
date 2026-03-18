import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestId: varchar('guest_id', { length: 64 }).notNull(),
  entryTag: varchar('entry_tag', { length: 20 }).notNull(), // 'clarity' | 'emotion' | 'procrastination'
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'completed'
  summaryJson: jsonb('summary_json'), // { blocks: [{ key, title, content }] }
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  helpful: boolean('helpful'),
  highlightText: text('highlight_text'),
  issueText: text('issue_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
