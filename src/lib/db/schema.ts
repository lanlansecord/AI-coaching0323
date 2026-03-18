import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestId: varchar('guest_id', { length: 64 }).notNull(),
  entryTag: varchar('entry_tag', { length: 20 }).notNull(), // 'clarity' | 'emotion' | 'procrastination' | 'general'
  mode: varchar('mode', { length: 10 }).notNull().default('text'), // 'text' | 'voice'
  aiModel: varchar('ai_model', { length: 50 }), // e.g. 'deepseek-chat', 'gpt-4o-realtime-preview'
  promptVersion: varchar('prompt_version', { length: 20 }), // e.g. 'v1.3'
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'completed' | 'abandoned'
  completionReason: varchar('completion_reason', { length: 20 }), // 'normal' | 'user_exit' | 'error'
  summaryJson: jsonb('summary_json'), // { blocks: [{ key, title, content }] }
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  // 语音聚合字段
  voiceDurationMs: integer('voice_duration_ms'),
  voiceTurnCount: integer('voice_turn_count'),
  interruptCount: integer('interrupt_count'),
  firstResponseLatencyMs: integer('first_response_latency_ms'),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  inputMode: varchar('input_mode', { length: 10 }).default('text'), // 'text' | 'voice'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 反馈表：3 维度评分 + 自由文字
export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  feltHeardScore: integer('felt_heard_score'), // 1-5: 有没有被听见
  gotClearerScore: integer('got_clearer_score'), // 1-5: 有没有更清楚
  returnIntentScore: integer('return_intent_score'), // 1-5: 愿不愿意再来
  freeTextFeedback: text('free_text_feedback'),
  // 保留旧字段兼容性
  helpful: boolean('helpful'),
  highlightText: text('highlight_text'),
  issueText: text('issue_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
