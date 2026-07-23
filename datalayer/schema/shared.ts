import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enums across the four stores.
 *
 * Design decision: enums are used where the value set is a *policy* decision
 * (consent categories, priorities, adherence) and plain text where the value
 * set is expected to grow organically without migrations (event_type,
 * intervention_type). Namespaced text types like "biometric.sleep" give us
 * queryable structure without a migration per new type.
 */

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "deletion_requested",
  "deleted",
]);

/**
 * Consent is per data category AND per purpose (GDPR art. 6/9: purpose
 * limitation). Never a single global boolean.
 */
export const consentCategoryEnum = pgEnum("consent_category", [
  "biometric", // wearable-derived health data (GDPR art. 9 special category)
  "training", // workout/session data
  "self_report", // subjective states (energy, mood, pain — also art. 9)
  "protocol", // protocol completion events
  "derived_pattern", // patterns we infer about the individual
]);

export const consentPurposeEnum = pgEnum("consent_purpose", [
  "personalization", // driving the individual's own Precision Loop
  "cold_start_similarity", // cross-user pattern embedding search
  "product_improvement", // aggregate/anonymized analysis
  "export", // data portability on request
]);

export const disciplineEnum = pgEnum("discipline", [
  "road_cycling",
  "gravel",
  "mtb",
  "running",
  "trail_running",
  "triathlon",
  "swimming",
  "xc_skiing",
  "rowing",
]);

export const thresholdKindEnum = pgEnum("threshold_kind", [
  "ftp_watts",
  "lthr_bpm",
  "css_pace_sec_per_100m",
  "run_threshold_pace_sec_per_km",
  "max_hr_bpm",
  "vo2max_est",
]);

export const thresholdMethodEnum = pgEnum("threshold_method", [
  "field_test",
  "lab_test",
  "estimated",
  "self_reported",
]);

export const goalPriorityEnum = pgEnum("goal_priority", ["A", "B", "C"]);

export const goalStatusEnum = pgEnum("goal_status", [
  "upcoming",
  "completed",
  "cancelled",
]);

/** Where an event came from. One row in the Event Log per (source, external_id, recorded_at). */
export const eventSourceEnum = pgEnum("event_source", [
  "whoop",
  "self_report",
  "protocol",
  "system",
  "manual",
]);

/**
 * Pattern lifecycle. Status is *derived* from (observation_count, confidence)
 * by PatternService — it exists as a column so queries are cheap, but the
 * service is the only writer and enforces: n < 5 can never be "established".
 * The system must never present a hypothesis with n=2 as knowledge.
 */
export const patternStatusEnum = pgEnum("pattern_status", [
  "hypothesis", // n < 5 or confidence < 0.5
  "emerging", // n >= 5 and confidence >= 0.5
  "established", // n >= 10 and confidence >= 0.7
  "retired", // contradicted or stale; kept for the ledger's history
]);

export const evidenceRoleEnum = pgEnum("evidence_role", [
  "antecedent",
  "outcome",
]);

export const adherenceEnum = pgEnum("adherence", [
  "full",
  "partial",
  "none",
  "unknown",
]);

export const hypothesisOutcomeEnum = pgEnum("hypothesis_outcome", [
  "confirmed",
  "partially_confirmed",
  "refuted",
  "inconclusive",
]);

export const deliveryChannelEnum = pgEnum("delivery_channel", [
  "push",
  "email",
  "in_app",
  "sms",
]);
