import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  appUser,
  athleteBaseline,
  athleteDiscipline,
  consent,
  goalEvent,
  threshold,
  userIdentity,
  userPreference,
} from "../../schema/profile.js";
import { event } from "../../schema/events.js";
import { pattern, patternEvidence } from "../../schema/patterns.js";
import {
  intervention,
  interventionEffectEvidence,
  interventionPattern,
} from "../../schema/ledger.js";

/**
 * GDPR art. 20 (data portability) + art. 15 (access): everything we hold
 * about ONE user, as a single machine-readable JSON document, grouped by
 * store. This is the only code path that intentionally combines
 * user_identity (PII) with the rest — the export goes to the data subject
 * themselves.
 *
 * Embeddings are omitted: they are derived, not provided by the user, and
 * carry no meaning without the model. Patterns (the interpretable form of
 * the same information) are included.
 */
export async function exportUserData(userId: string): Promise<{
  exportedAt: string;
  format: "1mm-twin-export/v1";
  profile: Record<string, unknown>;
  eventLog: unknown[];
  patternGraph: Record<string, unknown>;
  interventionLedger: Record<string, unknown>;
}> {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.userId, userId));
  if (!user) throw new Error("user not found");

  const [identity] = await db
    .select()
    .from(userIdentity)
    .where(eq(userIdentity.userId, userId));
  const consents = await db
    .select()
    .from(consent)
    .where(eq(consent.userId, userId))
    .orderBy(asc(consent.decidedAt));
  const [baseline] = await db
    .select()
    .from(athleteBaseline)
    .where(eq(athleteBaseline.userId, userId));
  const disciplines = await db
    .select()
    .from(athleteDiscipline)
    .where(eq(athleteDiscipline.userId, userId));
  const thresholds = await db
    .select()
    .from(threshold)
    .where(eq(threshold.userId, userId))
    .orderBy(asc(threshold.measuredAt));
  const goals = await db
    .select()
    .from(goalEvent)
    .where(eq(goalEvent.userId, userId));
  const preferences = await db
    .select()
    .from(userPreference)
    .where(eq(userPreference.userId, userId));

  const events = await db
    .select()
    .from(event)
    .where(eq(event.userId, userId))
    .orderBy(asc(event.recordedAt));

  const patterns = await db
    .select()
    .from(pattern)
    .where(eq(pattern.userId, userId));
  const patternIds = patterns.map((p) => p.patternId);
  const allEvidence =
    patternIds.length > 0
      ? await db
          .select()
          .from(patternEvidence)
          .where(inArray(patternEvidence.patternId, patternIds))
      : [];

  const interventions = await db
    .select()
    .from(intervention)
    .where(eq(intervention.userId, userId))
    .orderBy(asc(intervention.issuedAt));
  const interventionIds = interventions.map((i) => i.interventionId);
  const interventionPatterns =
    interventionIds.length > 0
      ? await db
          .select()
          .from(interventionPattern)
          .where(inArray(interventionPattern.interventionId, interventionIds))
      : [];
  const effectEvidence =
    interventionIds.length > 0
      ? await db
          .select()
          .from(interventionEffectEvidence)
          .where(
            inArray(
              interventionEffectEvidence.interventionId,
              interventionIds,
            ),
          )
      : [];

  return {
    exportedAt: new Date().toISOString(),
    format: "1mm-twin-export/v1",
    profile: {
      user,
      identity: identity ?? null,
      consents,
      baseline: baseline ?? null,
      disciplines,
      thresholds,
      goals,
      preferences,
    },
    eventLog: events,
    patternGraph: { patterns, evidence: allEvidence },
    interventionLedger: {
      interventions,
      patternLinks: interventionPatterns,
      effectEvidence,
    },
  };
}
