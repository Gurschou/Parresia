import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * 1MM AI database schema.
 *
 * Every user-owned table carries a userId foreign key, and every query in the
 * API layer MUST filter on the authenticated user's id (see apps/web guards).
 */

export const conversationModeEnum = pgEnum("conversation_mode", ["text", "voice", "mixed"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system", "tool"]);
export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "transcript",
  "tool_call",
  "tool_result",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "pending",
  "streaming",
  "completed",
  "failed",
]);
export const memoryCategoryEnum = pgEnum("memory_category", [
  "preference",
  "project",
  "goal",
  "work_method",
  "fact",
  "other",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // Argon2/bcrypt hash – never the raw password.
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    mode: conversationModeEnum("mode").notNull().default("text"),
    /** Rolling summary used as short-term context for long conversations. */
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("conversations_user_last_message_idx").on(t.userId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    messageType: messageTypeEnum("message_type").notNull().default("text"),
    status: messageStatusEnum("status").notNull().default("completed"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** Client-supplied key so retried requests never create duplicates. */
    idempotencyKey: uuid("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_user_idx").on(t.userId),
    uniqueIndex("messages_idempotency_unique")
      .on(t.conversationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

/** Dimension of text-embedding-3-small; keep in sync with OPENAI_EMBEDDING_MODEL. */
export const EMBEDDING_DIMENSIONS = 1536;

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceConversationId: uuid("source_conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    category: memoryCategoryEnum("category").notNull().default("other"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    importanceScore: numeric("importance_score", { precision: 3, scale: 2 })
      .notNull()
      .default("0.50"),
    confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 })
      .notNull()
      .default("0.50"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("memories_user_idx").on(t.userId),
    // HNSW index for fast cosine similarity search.
    index("memories_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_preferences_user_key_unique").on(t.userId, t.key)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    model: text("model"),
    inputUnits: integer("input_units").notNull().default(0),
    outputUnits: integer("output_units").notNull().default(0),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 6 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_user_created_idx").on(t.userId, t.createdAt)],
);

// Convenience row types.
export type UserRow = typeof users.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MemoryRow = typeof memories.$inferSelect;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type UsageEventRow = typeof usageEvents.$inferSelect;
