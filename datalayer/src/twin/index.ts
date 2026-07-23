import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  appUser,
  athleteBaseline,
  athleteDiscipline,
  goalEvent,
  threshold,
  userPreference,
} from "../../schema/profile.js";
import { event } from "../../schema/events.js";
import { pattern } from "../../schema/patterns.js";
import { intervention } from "../../schema/ledger.js";
import { getConsentState } from "../privacy/consent.js";

/**
 * Digital Twin read API.
 *
 * getTwinSnapshot(userId, atTime) returns the combined state of the four
 * stores as of `atTime`. Two different notions of "as of" apply and are
 * used deliberately:
 *
 *  - Event Log: filtered on ingested_at <= atTime, NOT recorded_at. The
 *    snapshot answers "what did the system KNOW at time T" — essential for
 *    honestly reconstructing why an intervention fired, because wearable
 *    data arrives late. An event recorded Monday but ingested Wednesday is
 *    NOT part of Tuesday's snapshot.
 *  - Profile/Pattern: current rows filtered on their own timestamps
 *    (thresholds by measured_at, patterns by created_at). These tables are
 *    low-frequency; row-level time filtering is a good-enough
 *    approximation in this phase (full temporal versioning of the Profile
 *    Store is deliberately deferred — see README).
 *
 * The returned object is a plain serializable value: the Precision Loop
 * freezes it into the Intervention Ledger's trigger_context.
 */

export interface TwinSnapshot {
  userId: string;
  atTime: string;
  profile: {
    timezone: string;
    locale: string;
    baseline: {
      trainingAgeYears: string | null;
      weeklyHoursAvg: string | null;
      historySummary: string | null;
    } | null;
    disciplines: Array<{ discipline: string; isPrimary: boolean }>;
    /** Newest threshold per kind as of atTime. */
    thresholds: Array<{
      kind: string;
      value: string;
      unit: string;
      method: string;
      measuredAt: string;
    }>;
    goals: Array<{
      name: string;
      eventDate: string;
      eventType: string;
      priority: string;
      status: string;
    }>;
    preferences: Array<{ key: string; value: unknown; reportedAt: string }>;
    consents: Array<{
      dataCategory: string;
      purpose: string;
      granted: boolean;
    }>;
  };
  recentEvents: Array<{
    eventId: string;
    eventType: string;
    source: string;
    recordedAt: string;
    ingestedAt: string;
    payload: unknown;
  }>;
  patterns: Array<{
    patternId: string;
    antecedent: unknown;
    consequent: unknown;
    strength: string;
    confidence: string;
    observationCount: number;
    status: string;
    lastObservedAt: string;
  }>;
  openInterventions: Array<{
    interventionId: string;
    interventionType: string;
    issuedAt: string;
    outcomeWindow: string;
  }>;
}

const RECENT_EVENT_WINDOW_DAYS = 14;
const RECENT_EVENT_LIMIT = 200;

export async function getTwinSnapshot(
  userId: string,
  atTime: Date = new Date(),
): Promise<TwinSnapshot> {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, userId));
  if (!user) throw new Error("user not found");

  const [baseline] = await db
    .select()
    .from(athleteBaseline)
    .where(eq(athleteBaseline.userId, userId));

  const disciplines = await db
    .select()
    .from(athleteDiscipline)
    .where(eq(athleteDiscipline.userId, userId));

  // Newest threshold per kind, as of atTime (DISTINCT ON pattern).
  const thresholds = await db
    .selectDistinctOn([threshold.kind])
    .from(threshold)
    .where(
      and(eq(threshold.userId, userId), lte(threshold.measuredAt, atTime)),
    )
    .orderBy(threshold.kind, desc(threshold.measuredAt));

  const goals = await db
    .select()
    .from(goalEvent)
    .where(and(eq(goalEvent.userId, userId), lte(goalEvent.createdAt, atTime)))
    .orderBy(goalEvent.eventDate);

  const preferences = await db
    .selectDistinctOn([userPreference.key])
    .from(userPreference)
    .where(
      and(
        eq(userPreference.userId, userId),
        lte(userPreference.reportedAt, atTime),
      ),
    )
    .orderBy(userPreference.key, desc(userPreference.reportedAt));

  const consents = await getConsentState(userId);

  const windowStart = new Date(
    atTime.getTime() - RECENT_EVENT_WINDOW_DAYS * 24 * 3600 * 1000,
  );
  const recentEvents = await db
    .select()
    .from(event)
    .where(
      and(
        eq(event.userId, userId),
        gte(event.recordedAt, windowStart),
        lte(event.recordedAt, atTime),
        // "What did we know at atTime": late-arriving data excluded.
        lte(event.ingestedAt, atTime),
        eq(event.isSuperseded, false),
      ),
    )
    .orderBy(desc(event.recordedAt))
    .limit(RECENT_EVENT_LIMIT);

  const patterns = await db
    .select()
    .from(pattern)
    .where(
      and(
        eq(pattern.userId, userId),
        lte(pattern.createdAt, atTime),
        sql`${pattern.status} <> 'retired'`,
      ),
    )
    .orderBy(desc(pattern.confidence));

  // Interventions whose outcome window is still open (or unmeasured) at atTime.
  const openInterventions = await db
    .select({
      interventionId: intervention.interventionId,
      interventionType: intervention.interventionType,
      issuedAt: intervention.issuedAt,
      outcomeWindow: intervention.outcomeWindow,
    })
    .from(intervention)
    .where(
      and(
        eq(intervention.userId, userId),
        lte(intervention.issuedAt, atTime),
        or(
          isNull(intervention.hypothesisOutcome),
          sql`upper(${intervention.outcomeWindow}) > ${atTime.toISOString()}::timestamptz`,
        ),
      ),
    )
    .orderBy(desc(intervention.issuedAt));

  return {
    userId,
    atTime: atTime.toISOString(),
    profile: {
      timezone: user.timezone,
      locale: user.locale,
      baseline: baseline
        ? {
            trainingAgeYears: baseline.trainingAgeYears,
            weeklyHoursAvg: baseline.weeklyHoursAvg,
            historySummary: baseline.historySummary,
          }
        : null,
      disciplines: disciplines.map((d) => ({
        discipline: d.discipline,
        isPrimary: d.isPrimary,
      })),
      thresholds: thresholds.map((t) => ({
        kind: t.kind,
        value: t.value,
        unit: t.unit,
        method: t.method,
        measuredAt: t.measuredAt.toISOString(),
      })),
      goals: goals.map((g) => ({
        name: g.name,
        eventDate: g.eventDate,
        eventType: g.eventType,
        priority: g.priority,
        status: g.status,
      })),
      preferences: preferences.map((p) => ({
        key: p.key,
        value: p.value,
        reportedAt: p.reportedAt.toISOString(),
      })),
      consents: consents.map((c) => ({
        dataCategory: c.dataCategory,
        purpose: c.purpose,
        granted: c.granted,
      })),
    },
    recentEvents: recentEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      source: e.source,
      recordedAt: e.recordedAt.toISOString(),
      ingestedAt: e.ingestedAt.toISOString(),
      payload: e.payload,
    })),
    patterns: patterns.map((p) => ({
      patternId: p.patternId,
      antecedent: p.antecedent,
      consequent: p.consequent,
      strength: p.strength,
      confidence: p.confidence,
      observationCount: p.observationCount,
      status: p.status,
      lastObservedAt: p.lastObservedAt.toISOString(),
    })),
    openInterventions: openInterventions.map((i) => ({
      interventionId: i.interventionId,
      interventionType: i.interventionType,
      issuedAt: i.issuedAt.toISOString(),
      outcomeWindow: String(i.outcomeWindow),
    })),
  };
}
