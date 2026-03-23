import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

// ─── 用户表 ───
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).unique(),        // 手机号，如 13800138000
  phoneVerified: boolean('phone_verified').default(false),
  displayName: varchar('display_name', { length: 100 }),    // 昵称
  avatarUrl: text('avatar_url'),                            // 头像
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── 短信验证码表 ───
export const verificationCodes = pgTable('verification_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── 对话会话表 ───
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestId: varchar('guest_id', { length: 64 }).notNull(),
  userId: uuid('user_id').references(() => users.id),       // 关联用户（可为空，兼容匿名）
  entryTag: varchar('entry_tag', { length: 20 }).notNull(), // 'clarity' | 'emotion' | 'procrastination' | 'general'
  mode: varchar('mode', { length: 10 }).notNull().default('text'), // 'text' | 'voice'
  aiModel: varchar('ai_model', { length: 50 }),
  promptVersion: varchar('prompt_version', { length: 20 }),
  title: varchar('title', { length: 200 }),                  // 自动生成的对话标题，如"走出拖延-如何克服写作焦虑"
  isFavorite: boolean('is_favorite').default(false),          // 收藏标记
  status: varchar('status', { length: 20 }).notNull().default('active'),
  completionReason: varchar('completion_reason', { length: 20 }),
  summaryJson: jsonb('summary_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  // 语音聚合字段
  voiceDurationMs: integer('voice_duration_ms'),
  voiceTurnCount: integer('voice_turn_count'),
  interruptCount: integer('interrupt_count'),
  firstResponseLatencyMs: integer('first_response_latency_ms'),
});

// ─── 消息表 ───
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  inputMode: varchar('input_mode', { length: 10 }).default('text'),
  audioUrl: text('audio_url'),
  audioDurationMs: integer('audio_duration_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── 反馈表 ───
export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  feltHeardScore: integer('felt_heard_score'),
  gotClearerScore: integer('got_clearer_score'),
  returnIntentScore: integer('return_intent_score'),
  freeTextFeedback: text('free_text_feedback'),
  helpful: boolean('helpful'),
  highlightText: text('highlight_text'),
  issueText: text('issue_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
