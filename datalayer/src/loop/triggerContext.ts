import { z } from "zod";
import type { TwinSnapshot } from "../twin/index.js";

/**
 * The frozen trigger_context written into the Intervention Ledger.
 *
 * It is a SNAPSHOT, not references: profile rows change, pattern confidence
 * drifts, events get superseded — but the ledger must preserve exactly what
 * the system saw when it decided. The Zod schema below is the contract; the
 * ledger trigger makes the column immutable after insert.
 *
 * profile_signature is a coarse, PII-free fingerprint of the profile,
 * designed for the query "which intervention types work for users with this
 * signature". Coarse bands, not raw values: raw FTP=287 fragments the
 * signature space and is closer to identifiable; bands bucket comparable
 * athletes together and are safe to retain after anonymization.
 */

export const profileSignatureSchema = z
  .object({
    disciplines: z.array(z.string()),
    training_age_band: z.enum(["<2y", "2-5y", "5-10y", "10y+"]).nullable(),
    volume_band: z.enum(["<5h", "5-8h", "8-12h", "12h+"]).nullable(),
    goal_horizon_days: z.number().int().nullable(),
    goal_priority: z.enum(["A", "B", "C"]).nullable(),
  })
  .strict();

export const triggerContextSchema = z
  .object({
    profile_snapshot: z.object({
      timezone: z.string(),
      baseline: z
        .object({
          trainingAgeYears: z.string().nullable(),
          weeklyHoursAvg: z.string().nullable(),
          historySummary: z.string().nullable(),
        })
        .nullable(),
      disciplines: z.array(
        z.object({ discipline: z.string(), isPrimary: z.boolean() }),
      ),
      thresholds: z.array(
        z.object({
          kind: z.string(),
          value: z.string(),
          unit: z.string(),
          method: z.string(),
          measuredAt: z.string(),
        }),
      ),
      goals: z.array(
        z.object({
          name: z.string(),
          eventDate: z.string(),
          eventType: z.string(),
          priority: z.string(),
          status: z.string(),
        }),
      ),
      preferences: z.array(
        z.object({
          key: z.string(),
          value: z.unknown(),
          reportedAt: z.string(),
        }),
      ),
    }),
    /** Digest of the events that informed the decision — id + type + time,
     *  plus the payload itself (already PII-free by construction). */
    recent_events: z.array(
      z.object({
        event_id: z.string().uuid(),
        event_type: z.string(),
        recorded_at: z.string(),
        payload: z.unknown(),
      }),
    ),
    /** Pattern state AS OF issue time — the live rows will drift. */
    patterns: z.array(
      z.object({
        pattern_id: z.string().uuid(),
        confidence: z.number(),
        n: z.number().int(),
        status: z.string(),
      }),
    ),
    profile_signature: profileSignatureSchema,
  })
  .strict();

export type TriggerContext = z.infer<typeof triggerContextSchema>;
export type ProfileSignature = z.infer<typeof profileSignatureSchema>;

export function buildProfileSignature(snapshot: TwinSnapshot): ProfileSignature {
  const trainingAge = snapshot.profile.baseline?.trainingAgeYears
    ? Number(snapshot.profile.baseline.trainingAgeYears)
    : null;
  const volume = snapshot.profile.baseline?.weeklyHoursAvg
    ? Number(snapshot.profile.baseline.weeklyHoursAvg)
    : null;
  const nextGoal = snapshot.profile.goals.find((g) => g.status === "upcoming");

  return {
    disciplines: snapshot.profile.disciplines.map((d) => d.discipline).sort(),
    training_age_band:
      trainingAge == null
        ? null
        : trainingAge < 2
          ? "<2y"
          : trainingAge < 5
            ? "2-5y"
            : trainingAge < 10
              ? "5-10y"
              : "10y+",
    volume_band:
      volume == null
        ? null
        : volume < 5
          ? "<5h"
          : volume < 8
            ? "5-8h"
            : volume < 12
              ? "8-12h"
              : "12h+",
    goal_horizon_days: nextGoal
      ? Math.max(
          0,
          Math.round(
            (new Date(nextGoal.eventDate).getTime() -
              new Date(snapshot.atTime).getTime()) /
              86_400_000,
          ),
        )
      : null,
    goal_priority: nextGoal ? (nextGoal.priority as "A" | "B" | "C") : null,
  };
}

/** Freeze a twin snapshot into the ledger's trigger_context shape. */
export function buildTriggerContext(snapshot: TwinSnapshot): TriggerContext {
  return triggerContextSchema.parse({
    profile_snapshot: {
      timezone: snapshot.profile.timezone,
      baseline: snapshot.profile.baseline,
      disciplines: snapshot.profile.disciplines,
      thresholds: snapshot.profile.thresholds,
      goals: snapshot.profile.goals,
      preferences: snapshot.profile.preferences,
    },
    recent_events: snapshot.recentEvents.map((e) => ({
      event_id: e.eventId,
      event_type: e.eventType,
      recorded_at: e.recordedAt,
      payload: e.payload,
    })),
    patterns: snapshot.patterns.map((p) => ({
      pattern_id: p.patternId,
      confidence: Number(p.confidence),
      n: p.observationCount,
      status: p.status,
    })),
    profile_signature: buildProfileSignature(snapshot),
  });
}
