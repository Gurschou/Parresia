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
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import {
  adherenceEnum,
  deliveryChannelEnum,
  hypothesisOutcomeEnum,
} from "./shared.js";

/** tstzrange isn't built into drizzle; the outcome window is a real range so
 *  Postgres can do containment queries (`recorded_at <@ outcome_window`). */
const tstzrange = customType<{ data: string }>({
  dataType() {
    return "tstzrange";
  },
});

/**
 * INTERVENTION LEDGER
 * ===================
 * The long-term moat. Every intervention must be reconstructable backwards:
 * what context triggered it, what we hypothesized, what we did, and what
 * happened afterwards. Wrong predictions are part of the dataset — history
 * is never corrected.
 *
 * The requirement is AUDITABILITY, not cryptographic immutability. It is
 * enforced with a database trigger (see migration 0001):
 *
 *   - DELETE: always rejected.
 *   - UPDATE: rejected unless it ONLY (a) fills currently-NULL outcome
 *     columns (delivery_*, seen_at, adherence*, measured_effect,
 *     hypothesis_outcome, effect_measured_at), or (b) performs anonymization
 *     (user_id -> NULL + anonymized_at set). A filled outcome column can
 *     never be changed again (write-once).
 *
 * Erasure vs. the ledger (GDPR art. 17): Profile and Event Log are hard
 * deleted, but ledger rows are ANONYMIZED instead of deleted. Legal basis:
 * art. 17(3)(b)/(d) — the record of what the system decided and whether its
 * hypotheses held is necessary for safety accountability and for scientific/
 * statistical purposes, and after anonymization (user_id nulled; the
 * trigger_context is PII-free BY CONSTRUCTION, containing only physiological
 * and structural fields) the row no longer relates to an identifiable
 * person, taking it outside the GDPR's scope. This trade-off is deliberate
 * and documented here and in src/privacy/deletion.ts.
 */
export const intervention = pgTable(
  "intervention",
  {
    interventionId: uuid("intervention_id").primaryKey().defaultRandom(),
    /** Nullable ONLY because anonymization nulls it. Set at issue time. */
    userId: uuid("user_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // ------------------------------------------------------------------
    // Frozen at issue. The trigger context is a SNAPSHOT (jsonb), not a
    // reference: profiles change, patterns' confidence moves, events get
    // superseded — but what triggered THIS intervention must stay exactly
    // as it was. Shape (validated by Zod in src/loop/triggerContext.ts):
    //   {
    //     profile_snapshot:  { baseline, thresholds, goals, preferences },
    //     recent_events:     [{ event_id, event_type, recorded_at, digest }],
    //     patterns:          [{ pattern_id, confidence, n, status }],
    //     profile_signature: { disciplines, training_age_band,
    //                          volume_band, goal_horizon_days, ... }
    //   }
    // profile_signature is a coarse, PII-free fingerprint with a GIN index,
    // making "which intervention types work for users with this signature"
    // a containment query.
    // ------------------------------------------------------------------
    triggerContext: jsonb("trigger_context").notNull(),
    /**
     * { expected_outcome: string, rationale: string,
     *   expected_direction: "increase"|"decrease"|"stable",
     *   expected_magnitude_pct?: number, metric: string }
     * Structured so hypothesis_outcome can be computed mechanically after
     * the window closes.
     */
    hypothesis: jsonb("hypothesis").notNull(),
    /** Namespaced, e.g. "recovery.sleep_extension", "load.reduce_intensity". */
    interventionType: text("intervention_type").notNull(),
    /** What was actually shown/sent to the user. */
    content: jsonb("content").notNull(),
    modelVersion: text("model_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    /** Fixed at issue: the period in which the effect is measured. */
    outcomeWindow: tstzrange("outcome_window").notNull(),

    // ------------------------------------------------------------------
    // Write-once outcome columns. NULL until known; trigger-enforced
    // NULL -> value, never value -> other value.
    // ------------------------------------------------------------------
    deliveryChannel: deliveryChannelEnum("delivery_channel"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    adherence: adherenceEnum("adherence"),
    adherenceRecordedAt: timestamp("adherence_recorded_at", {
      withTimezone: true,
    }),
    /**
     * { metric, direction, baseline_value, observed_value, magnitude_pct,
     *   method } — filled asynchronously by the post-protocol phase, with
     * the supporting events referenced in intervention_effect_evidence.
     */
    measuredEffect: jsonb("measured_effect"),
    /** Was the hypothesis right? Plain column => hit-rate GROUP BY is trivial. */
    hypothesisOutcome: hypothesisOutcomeEnum("hypothesis_outcome"),
    effectMeasuredAt: timestamp("effect_measured_at", { withTimezone: true }),

    /** Set by anonymization (GDPR erasure of the person, not the record). */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  },
  (t) => [
    index("intervention_user_idx").on(t.userId, t.issuedAt),
    index("intervention_type_outcome_idx").on(
      t.interventionType,
      t.hypothesisOutcome,
    ),
    // GIN index on (trigger_context -> 'profile_signature') in migration.
  ],
);

/**
 * Which patterns the intervention was built on — a junction table (not just
 * a uuid[] column) so "which patterns generate interventions that
 * consistently fail" is a plain join + GROUP BY. Confidence and n are FROZEN
 * copies from issue time: the live pattern row will drift (that is its job),
 * the ledger must not.
 *
 * Deliberately NO foreign key to pattern: patterns may be retired/rebuilt/
 * erased, the ledger survives.
 */
export const interventionPattern = pgTable(
  "intervention_pattern",
  {
    interventionId: uuid("intervention_id")
      .notNull()
      .references(() => intervention.interventionId, { onDelete: "restrict" }),
    patternId: uuid("pattern_id").notNull(),
    confidenceAtIssue: numeric("confidence_at_issue", {
      precision: 4,
      scale: 3,
    }).notNull(),
    nAtIssue: integer("n_at_issue").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.interventionId, t.patternId] }),
    index("intervention_pattern_pattern_idx").on(t.patternId),
  ],
);

/**
 * The concrete events measured_effect is based on. Addressed by
 * (event_id, recorded_at); no FK to the hypertable (events may be erased —
 * the measurement itself lives on in measured_effect, this table is the
 * audit trail of where it came from).
 */
export const interventionEffectEvidence = pgTable(
  "intervention_effect_evidence",
  {
    interventionId: uuid("intervention_id")
      .notNull()
      .references(() => intervention.interventionId, { onDelete: "restrict" }),
    eventId: uuid("event_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.interventionId, t.eventId] })],
);
