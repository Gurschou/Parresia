import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { eventSourceEnum } from "./shared.js";

/**
 * EVENT LOG
 * =========
 * Append-only, high-frequency observations. This table is converted to a
 * TimescaleDB hypertable in the initial migration:
 *
 *   time dimension:  recorded_at (1-week chunks)
 *   space dimension: user_id (4 partitions — enough for this phase)
 *
 * Design decisions, in order of importance:
 *
 * 1. ONE shared envelope for all event kinds. Biometrics, workouts,
 *    self-reports and protocol events all share (source, event_type,
 *    recorded_at, ingested_at, payload, schema_version). The payload is
 *    validated per event_type by Zod at the ingest boundary
 *    (src/ingest/eventSchemas.ts) — the database stores what the boundary
 *    has already proven well-formed.
 *
 * 2. Idempotent ingest. UNIQUE (source, external_id, user_id, recorded_at).
 *    The user_id/recorded_at components are required because TimescaleDB
 *    unique indexes must include the partitioning columns; harmless for
 *    dedup because a re-delivered event belongs to the same user and
 *    carries the same recorded_at. Ingest uses ON CONFLICT DO NOTHING, so
 *    replaying a Whoop backfill is a no-op.
 *
 * 3. recorded_at vs ingested_at are separate columns, always. Wearable data
 *    arrives late and gets corrected retroactively; analyses that care about
 *    "what did we know at time T" (e.g. reconstructing an intervention's
 *    trigger context) filter on ingested_at, while physiology queries filter
 *    on recorded_at.
 *
 * 4. NO UPDATES, with one narrow, deliberate exception. Corrections are new
 *    rows: the adapter appends a revision suffix to external_id
 *    ("whoop-sleep-123:2") and sets supersedes_event_id to the row being
 *    replaced. The exception: writing a correction flips is_superseded=false
 *    to true on the OLD row (write-once, enforced by trigger) so that
 *    continuous aggregates — which cannot join against a "latest revision"
 *    subquery — exclude stale rows. Approved deviation; see README.
 *
 * 5. NO foreign key to app_user. A FK from a large hypertable to a small
 *    table makes erasure and chunk-drop operations pay for constraint checks
 *    and couples the Event Log's lifecycle to the Profile Store's. Erasure
 *    deletes events explicitly in the same transaction as the profile
 *    (src/privacy/deletion.ts). This also keeps the Event Log replaceable by
 *    a different storage engine later without touching Profile.
 */
export const event = pgTable(
  "event",
  {
    eventId: uuid("event_id").notNull().defaultRandom(),
    userId: uuid("user_id").notNull(),
    source: eventSourceEnum("source").notNull(),
    /**
     * The source's own id for this observation. Whoop: the resource id (+
     * ":rev<n>" for corrections). Self-report/protocol: a client-generated
     * uuid so retries are idempotent too.
     */
    externalId: text("external_id").notNull(),
    /**
     * Namespaced, e.g. "biometric.sleep", "biometric.recovery",
     * "biometric.hrv", "workout.cycling", "state.energy", "state.mood",
     * "state.pain", "protocol.step_completed". Text, not enum: new types
     * must not require a migration. The closed list lives in
     * src/ingest/eventSchemas.ts where each type gets a Zod payload schema.
     */
    eventType: text("event_type").notNull(),
    /** When it happened in the real world (start of the observation window). */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    /** When WE received it. Never defaulted from recorded_at. */
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Validated by Zod per event_type before insert. Never contains PII. */
    payload: jsonb("payload").notNull(),
    /** Version of the payload schema for this event_type at write time. */
    schemaVersion: smallint("schema_version").notNull().default(1),
    /** Set on correction rows: points at the event this row replaces. */
    supersedesEventId: uuid("supersedes_event_id"),
    /**
     * Flipped (once) on the superseded row when a correction lands, so
     * continuous aggregates can exclude stale data with a plain WHERE.
     * Trigger-enforced write-once; every other column is immutable.
     */
    isSuperseded: boolean("is_superseded").notNull().default(false),
  },
  (t) => [
    // Hypertable PK must include both partition columns (time + space).
    primaryKey({ columns: [t.eventId, t.userId, t.recordedAt] }),
    uniqueIndex("event_dedupe_idx").on(
      t.source,
      t.externalId,
      t.userId,
      t.recordedAt,
    ),
    index("event_user_time_idx").on(t.userId, t.recordedAt),
    index("event_user_type_time_idx").on(t.userId, t.eventType, t.recordedAt),
  ],
);
