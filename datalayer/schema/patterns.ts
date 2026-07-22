import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { evidenceRoleEnum, patternStatusEnum } from "./shared.js";

/**
 * PATTERN GRAPH
 * =============
 * Derived, per-individual correlations between states, context and outcomes.
 * Implemented as relational tables + pgvector, NOT a graph database: at this
 * scale a pattern is a row and its evidence is a join, and keeping it in the
 * same Postgres instance means the Precision Loop's read-modify-write on
 * confidence is a plain transaction.
 *
 * This is the only store with in-place updates. That is deliberate: patterns
 * are DERIVED state (confidence and n move as evidence accumulates), not
 * source data. The source data — the events — remains append-only, so any
 * pattern can be recomputed from scratch.
 *
 * Replaceability: nothing outside this file references pattern internals.
 * The Intervention Ledger stores pattern_id + a frozen (confidence, n)
 * snapshot at issue time, so the ledger stays meaningful even if this store
 * is rebuilt or swapped for a different engine.
 */

/**
 * One observed correlation for ONE user. Cross-user knowledge only ever
 * flows through pattern_embedding similarity (cold start) — never by writing
 * to another user's rows. "1MM som 1MM".
 */
export const pattern = pgTable(
  "pattern",
  {
    patternId: uuid("pattern_id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /**
     * Structured condition, e.g.:
     * { "metric": "hrv_rmssd", "relation": "below_baseline_pct",
     *   "value": 15, "window_hours": 48 }
     * Structured (not free text) so antecedents can be matched against a
     * twin snapshot mechanically. Validated by Zod in src/loop/.
     */
    antecedent: jsonb("antecedent").notNull(),
    /**
     * Expected consequence, e.g.:
     * { "metric": "session_quality", "direction": "decrease",
     *   "magnitude_pct": 20, "window_hours": 24 }
     */
    consequent: jsonb("consequent").notNull(),
    /** Signed effect size estimate (consequent units, normalized -1..1). */
    strength: numeric("strength", { precision: 4, scale: 3 }).notNull(),
    /**
     * 0..1. ALWAYS presented together with observation_count. A pattern with
     * n=2 is a hypothesis regardless of how strong the correlation looks —
     * the status column encodes that rule and PatternService enforces it.
     */
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    observationCount: integer("observation_count").notNull().default(0),
    status: patternStatusEnum("status").notNull().default("hypothesis"),
    firstObservedAt: timestamp("first_observed_at", {
      withTimezone: true,
    }).notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Canonical digest of (antecedent, consequent) computed in
     * PatternService; UNIQUE with user_id so the same correlation is updated
     * (n++, confidence adjusted), never duplicated.
     */
    semanticKey: text("semantic_key").notNull(),
  },
  (t) => [
    index("pattern_user_idx").on(t.userId, t.status),
    // uniqueness on (user_id, semantic_key) is created in the migration
  ],
);

/**
 * Links a pattern to the concrete events that support it. Event rows are
 * addressed by (event_id, recorded_at) because the hypertable's PK includes
 * the partition column. No FK to the hypertable (same rationale as the
 * ledger: evidence must survive event-store reshaping; erasure handles
 * cleanup explicitly).
 */
export const patternEvidence = pgTable(
  "pattern_evidence",
  {
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => pattern.patternId, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    role: evidenceRoleEnum("role").notNull(),
    /** 0..1; lets the confidence model discount weak/indirect evidence. */
    weight: numeric("weight", { precision: 4, scale: 3 })
      .notNull()
      .default("1"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patternId, t.eventId] })],
);

/**
 * Vector representation of a pattern for cross-user similarity search.
 * ONLY used for cold start: "athletes similar to you often show X" seeds a
 * new user's hypotheses at low confidence — it never overwrites or outranks
 * the individual's own observed patterns. Reading other users' embeddings
 * requires their cold_start_similarity consent (checked in service code).
 *
 * vector(1536) = OpenAI text-embedding-3-small; model recorded per row so a
 * model swap can re-embed incrementally.
 */
export const patternEmbedding = pgTable("pattern_embedding", {
  patternId: uuid("pattern_id")
    .primaryKey()
    .references(() => pattern.patternId, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  embeddingModel: text("embedding_model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
