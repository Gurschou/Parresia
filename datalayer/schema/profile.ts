import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  consentCategoryEnum,
  consentPurposeEnum,
  disciplineEnum,
  goalPriorityEnum,
  goalStatusEnum,
  thresholdKindEnum,
  thresholdMethodEnum,
  userStatusEnum,
} from "./shared.js";

/**
 * PROFILE STORE
 * =============
 * Stable, structured, strongly consistent data about the individual.
 * Fully normalized. Every table cascades from app_user so that GDPR art. 17
 * erasure of one individual is a single `DELETE FROM app_user` in one
 * transaction (the Event Log, which deliberately has no FK, is deleted
 * explicitly in the same transaction by src/privacy/deletion.ts).
 */

/**
 * The root identity row. Deliberately contains NO PII — only operational
 * attributes. Everything else in the system references user_id (an opaque
 * uuid), which is what makes the redaction layer enforceable: PII lives in
 * exactly one table (user_identity) and never leaves it.
 */
export const appUser = pgTable("app_user", {
  userId: uuid("user_id").primaryKey().defaultRandom(),
  /** IANA zone, e.g. "Europe/Copenhagen". Needed to bucket days correctly per user. */
  timezone: text("timezone").notNull().default("Europe/Copenhagen"),
  /** BCP 47, e.g. "da-DK". */
  locale: text("locale").notNull().default("da-DK"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The ONLY table allowed to contain directly identifying data (PII).
 * The redaction layer (src/privacy/redaction.ts) is whitelist-based and this
 * table is never part of any whitelist sent to logs or model APIs.
 */
export const userIdentity = pgTable("user_identity", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUser.userId, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  /** Subject id at the external auth provider; auth itself is out of scope here. */
  authSubject: text("auth_subject"),
});

/**
 * Consent ledger: append-only. One row per decision; the *latest* row per
 * (user, category, purpose) is the current state. We never UPDATE consent —
 * a withdrawal is a new row with granted=false, which preserves the full
 * consent history required to demonstrate compliance (GDPR art. 7(1)).
 */
export const consent = pgTable(
  "consent",
  {
    consentId: uuid("consent_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.userId, { onDelete: "cascade" }),
    dataCategory: consentCategoryEnum("data_category").notNull(),
    purpose: consentPurposeEnum("purpose").notNull(),
    granted: boolean("granted").notNull(),
    /** Version of the consent text the user actually saw. */
    policyVersion: text("policy_version").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("consent_current_idx").on(
      t.userId,
      t.dataCategory,
      t.purpose,
      t.decidedAt,
    ),
  ],
);

/**
 * Current athlete baseline, 1:1 with the user. This is "the profile as it is
 * now" — historical changes to fitness are events (Event Log), not rows here.
 */
export const athleteBaseline = pgTable("athlete_baseline", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUser.userId, { onDelete: "cascade" }),
  trainingAgeYears: numeric("training_age_years", {
    precision: 4,
    scale: 1,
  }),
  weeklyHoursAvg: numeric("weekly_hours_avg", { precision: 4, scale: 1 }),
  /** Free-text summary of training history; no PII by convention (enforced at input validation). */
  historySummary: text("history_summary"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const athleteDiscipline = pgTable(
  "athlete_discipline",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.userId, { onDelete: "cascade" }),
    discipline: disciplineEnum("discipline").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.discipline] })],
);

/**
 * Thresholds (FTP, LTHR, CSS, ...) are kept as history: the newest row per
 * (user, kind) is the current value. History stays here (not the Event Log)
 * because a threshold is a *profile fact* with a measurement method, not a
 * high-frequency observation — and it must die with the profile on erasure.
 */
export const threshold = pgTable(
  "threshold",
  {
    thresholdId: uuid("threshold_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.userId, { onDelete: "cascade" }),
    kind: thresholdKindEnum("kind").notNull(),
    value: numeric("value", { precision: 8, scale: 2 }).notNull(),
    unit: text("unit").notNull(),
    method: thresholdMethodEnum("method").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("threshold_current_idx").on(t.userId, t.kind, t.measuredAt)],
);

export const goalEvent = pgTable(
  "goal_event",
  {
    goalEventId: uuid("goal_event_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    eventDate: date("event_date").notNull(),
    /** Free-form but conventionally namespaced, e.g. "gravel_race_140km". */
    eventType: text("event_type").notNull(),
    priority: goalPriorityEnum("priority").notNull(),
    status: goalStatusEnum("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("goal_event_user_idx").on(t.userId, t.eventDate)],
);

/**
 * Self-reported preferences and constraints — the "tools the person actually
 * uses", schedule constraints, dietary constraints etc. Key/value with jsonb
 * values because this set grows per-user and per-interview; normalizing each
 * preference into its own table would be premature.
 */
export const userPreference = pgTable(
  "user_preference",
  {
    preferenceId: uuid("preference_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.userId, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_preference_idx").on(t.userId, t.key, t.reportedAt)],
);
