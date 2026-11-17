import { date, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { AnalysisContext, AnalysisMeta, AnalysisResult } from "@bm/core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

/** "Model/ekspert"-objektet: den person, analyser modellerer. */
export const experts = pgTable(
  "experts",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("experts_owner_idx").on(t.ownerId)],
);

export const ANALYSIS_STATUSES = ["queued", "transcribing", "analyzing", "completed", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export const SOURCE_TYPES = ["text", "file", "audio", "video"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface MediaInfo {
  provider?: string;
  durationSec?: number;
  chunks?: number;
  sizeBytes?: number;
  language?: string;
}

export const analyses = pgTable(
  "analyses",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    expertId: text("expert_id").references(() => experts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
    sourceName: text("source_name").notNull().default(""),
    transcript: text("transcript").notNull().default(""),
    context: jsonb("context").$type<AnalysisContext>().notNull().default({}),
    status: text("status", { enum: ANALYSIS_STATUSES }).notNull().default("queued"),
    stageMessage: text("stage_message").notNull().default(""),
    progress: integer("progress").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    uploadPath: text("upload_path"),
    mediaInfo: jsonb("media_info").$type<MediaInfo>(),
    result: jsonb("result").$type<AnalysisResult>(),
    meta: jsonb("meta").$type<AnalysisMeta>(),
    schemaVersion: integer("schema_version"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    sessionDate: date("session_date", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("analyses_owner_created_idx").on(t.ownerId, t.createdAt),
    index("analyses_expert_idx").on(t.expertId),
    index("analyses_project_idx").on(t.projectId),
    index("analyses_status_idx").on(t.status),
  ],
);

/** Kurateret mønsterbibliotek: fælles mønstre på tværs af eksperter. */
export const patterns = pgTable(
  "patterns",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("patterns_owner_idx").on(t.ownerId)],
);

export interface PatternExcerpt {
  label: string;
  detail?: string;
  quotes?: string[];
}

export const patternExamples = pgTable(
  "pattern_examples",
  {
    id: id(),
    patternId: text("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    excerpt: jsonb("excerpt").$type<PatternExcerpt>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("pattern_examples_pattern_idx").on(t.patternId)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Expert = typeof experts.$inferSelect;
export type Analysis = typeof analyses.$inferSelect;
export type Pattern = typeof patterns.$inferSelect;
export type PatternExample = typeof patternExamples.$inferSelect;
