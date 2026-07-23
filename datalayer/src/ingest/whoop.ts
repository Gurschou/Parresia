import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { event } from "../../schema/events.js";
import type { NormalizedEvent, SourceAdapter } from "./adapter.js";

/**
 * Whoop adapter (API v2 data model: sleep, recovery, cycle, workout).
 *
 * Transport is abstracted behind WhoopClient so the adapter is testable and
 * seedable without credentials — production wires an OAuth HTTP client,
 * tests wire fixtures. The adapter owns two things:
 *
 *  1. Mapping Whoop resources -> normalized events (biometric.sleep,
 *     biometric.recovery, biometric.strain, workout.session).
 *
 *  2. Revision handling. Whoop recalculates scores retroactively (e.g. a
 *     sleep re-scored hours later). A record with updated_at > created_at is
 *     a CORRECTION: it gets external_id "<base>:rev<updated_at epoch>" and a
 *     supersedes pointer to the newest previously-ingested row for the same
 *     base id. The original delivery keeps the bare base id. Re-delivery of
 *     the SAME revision therefore always produces the same external_id and
 *     dedupes to nothing — idempotency and corrections don't fight.
 */

// --- Raw Whoop v2 shapes (subset we consume), validated defensively -----

const whoopScoreState = z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);

const whoopSleepSchema = z.object({
  id: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  nap: z.boolean(),
  score_state: whoopScoreState,
  score: z
    .object({
      stage_summary: z.object({
        total_in_bed_time_milli: z.number(),
        total_awake_time_milli: z.number(),
        total_light_sleep_time_milli: z.number(),
        total_slow_wave_sleep_time_milli: z.number(),
        total_rem_sleep_time_milli: z.number(),
      }),
      sleep_performance_percentage: z.number().nullable().optional(),
      sleep_efficiency_percentage: z.number().nullable().optional(),
    })
    .optional(),
});

const whoopRecoverySchema = z.object({
  cycle_id: z.number(),
  sleep_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  score_state: whoopScoreState,
  score: z
    .object({
      recovery_score: z.number(),
      hrv_rmssd_milli: z.number(),
      resting_heart_rate: z.number(),
      spo2_percentage: z.number().nullable().optional(),
      skin_temp_celsius: z.number().nullable().optional(),
    })
    .optional(),
});

const whoopCycleSchema = z.object({
  id: z.number(),
  start: z.string().datetime(),
  end: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  score_state: whoopScoreState,
  score: z
    .object({
      strain: z.number(),
      average_heart_rate: z.number(),
      max_heart_rate: z.number(),
      kilojoule: z.number(),
    })
    .optional(),
});

const whoopWorkoutSchema = z.object({
  id: z.string(),
  sport_name: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  score_state: whoopScoreState,
  score: z
    .object({
      strain: z.number(),
      average_heart_rate: z.number(),
      max_heart_rate: z.number(),
      kilojoule: z.number().optional(),
      distance_meter: z.number().nullable().optional(),
    })
    .optional(),
});

export type WhoopSleep = z.infer<typeof whoopSleepSchema>;
export type WhoopRecovery = z.infer<typeof whoopRecoverySchema>;
export type WhoopCycle = z.infer<typeof whoopCycleSchema>;
export type WhoopWorkout = z.infer<typeof whoopWorkoutSchema>;

/** Transport abstraction: HTTP client in production, fixtures in tests. */
export interface WhoopClient {
  getSleeps(userId: string, since: Date): Promise<unknown[]>;
  getRecoveries(userId: string, since: Date): Promise<unknown[]>;
  getCycles(userId: string, since: Date): Promise<unknown[]>;
  getWorkouts(userId: string, since: Date): Promise<unknown[]>;
}

const whoopWebhookSchema = z.object({
  type: z.enum([
    "sleep.updated",
    "recovery.updated",
    "cycle.updated",
    "workout.updated",
  ]),
  data: z.unknown(),
});

const msToMin = (ms: number): number => Math.round(ms / 60_000) ;

export class WhoopAdapter implements SourceAdapter {
  readonly source = "whoop" as const;

  constructor(private readonly client: WhoopClient) {}

  async fetchSince(userId: string, since: Date): Promise<NormalizedEvent[]> {
    const [sleeps, recoveries, cycles, workouts] = await Promise.all([
      this.client.getSleeps(userId, since),
      this.client.getRecoveries(userId, since),
      this.client.getCycles(userId, since),
      this.client.getWorkouts(userId, since),
    ]);

    const events: NormalizedEvent[] = [];
    for (const raw of sleeps) {
      const ev = await this.mapSleep(userId, whoopSleepSchema.parse(raw));
      if (ev) events.push(ev);
    }
    for (const raw of recoveries) {
      const ev = await this.mapRecovery(userId, whoopRecoverySchema.parse(raw));
      if (ev) events.push(ev);
    }
    for (const raw of cycles) {
      const ev = await this.mapCycle(userId, whoopCycleSchema.parse(raw));
      if (ev) events.push(ev);
    }
    for (const raw of workouts) {
      const ev = await this.mapWorkout(userId, whoopWorkoutSchema.parse(raw));
      if (ev) events.push(ev);
    }
    return events;
  }

  async handleWebhook(
    userId: string,
    body: unknown,
  ): Promise<NormalizedEvent[]> {
    const hook = whoopWebhookSchema.parse(body);
    switch (hook.type) {
      case "sleep.updated": {
        const ev = await this.mapSleep(userId, whoopSleepSchema.parse(hook.data));
        return ev ? [ev] : [];
      }
      case "recovery.updated": {
        const ev = await this.mapRecovery(userId, whoopRecoverySchema.parse(hook.data));
        return ev ? [ev] : [];
      }
      case "cycle.updated": {
        const ev = await this.mapCycle(userId, whoopCycleSchema.parse(hook.data));
        return ev ? [ev] : [];
      }
      case "workout.updated": {
        const ev = await this.mapWorkout(userId, whoopWorkoutSchema.parse(hook.data));
        return ev ? [ev] : [];
      }
    }
  }

  // --- mapping -----------------------------------------------------------

  private async mapSleep(
    userId: string,
    s: WhoopSleep,
  ): Promise<NormalizedEvent | null> {
    if (s.score_state !== "SCORED" || !s.score) return null;
    const sum = s.score.stage_summary;
    return this.withRevision(userId, `whoop-sleep-${s.id}`, s, {
      eventType: "biometric.sleep",
      recordedAt: new Date(s.start),
      payload: {
        duration_min:
          msToMin(sum.total_in_bed_time_milli - sum.total_awake_time_milli),
        time_in_bed_min: msToMin(sum.total_in_bed_time_milli),
        rem_min: msToMin(sum.total_rem_sleep_time_milli),
        sws_min: msToMin(sum.total_slow_wave_sleep_time_milli),
        light_min: msToMin(sum.total_light_sleep_time_milli),
        awake_min: msToMin(sum.total_awake_time_milli),
        ...(s.score.sleep_efficiency_percentage != null && {
          sleep_efficiency_pct: s.score.sleep_efficiency_percentage,
        }),
        ...(s.score.sleep_performance_percentage != null && {
          sleep_performance_pct: s.score.sleep_performance_percentage,
        }),
        is_nap: s.nap,
      },
    });
  }

  private async mapRecovery(
    userId: string,
    r: WhoopRecovery,
  ): Promise<NormalizedEvent | null> {
    if (r.score_state !== "SCORED" || !r.score) return null;
    return this.withRevision(userId, `whoop-recovery-${r.cycle_id}`, r, {
      eventType: "biometric.recovery",
      recordedAt: new Date(r.created_at),
      payload: {
        recovery_score: r.score.recovery_score,
        hrv_rmssd_ms: r.score.hrv_rmssd_milli,
        resting_hr_bpm: r.score.resting_heart_rate,
        ...(r.score.spo2_percentage != null && {
          spo2_pct: r.score.spo2_percentage,
        }),
        ...(r.score.skin_temp_celsius != null && {
          skin_temp_c: r.score.skin_temp_celsius,
        }),
      },
    });
  }

  private async mapCycle(
    userId: string,
    c: WhoopCycle,
  ): Promise<NormalizedEvent | null> {
    if (c.score_state !== "SCORED" || !c.score) return null;
    return this.withRevision(userId, `whoop-cycle-${c.id}`, c, {
      eventType: "biometric.strain",
      recordedAt: new Date(c.start),
      payload: {
        strain: c.score.strain,
        avg_hr_bpm: c.score.average_heart_rate,
        max_hr_bpm: c.score.max_heart_rate,
        kilojoules: c.score.kilojoule,
      },
    });
  }

  private async mapWorkout(
    userId: string,
    w: WhoopWorkout,
  ): Promise<NormalizedEvent | null> {
    if (w.score_state !== "SCORED" || !w.score) return null;
    return this.withRevision(userId, `whoop-workout-${w.id}`, w, {
      eventType: "workout.session",
      recordedAt: new Date(w.start),
      payload: {
        sport: w.sport_name,
        duration_min: msToMin(
          new Date(w.end).getTime() - new Date(w.start).getTime(),
        ),
        strain: w.score.strain,
        avg_hr_bpm: w.score.average_heart_rate,
        max_hr_bpm: w.score.max_heart_rate,
        ...(w.score.kilojoule != null && { kilojoules: w.score.kilojoule }),
        ...(w.score.distance_meter != null && {
          distance_km: Math.round(w.score.distance_meter / 10) / 100,
        }),
      },
    });
  }

  /**
   * Revision logic shared by all resource types. Original deliveries
   * (updated_at == created_at) use the bare base id. Corrections get a
   * revisioned external_id plus a supersedes pointer to the newest existing
   * row for the same base id (if we ever ingested one).
   */
  private async withRevision(
    userId: string,
    baseExternalId: string,
    resource: { created_at: string; updated_at: string },
    rest: Pick<NormalizedEvent, "eventType" | "recordedAt" | "payload">,
  ): Promise<NormalizedEvent> {
    const isRevision =
      new Date(resource.updated_at).getTime() >
      new Date(resource.created_at).getTime();

    if (!isRevision) {
      return { userId, source: this.source, externalId: baseExternalId, ...rest };
    }

    const externalId = `${baseExternalId}:rev${Math.floor(
      new Date(resource.updated_at).getTime() / 1000,
    )}`;
    const previous = await findLatestWhoopEvent(baseExternalId, externalId);
    return {
      userId,
      source: this.source,
      externalId,
      ...rest,
      ...(previous && {
        supersedes: {
          eventId: previous.eventId,
          recordedAt: previous.recordedAt,
        },
      }),
    };
  }
}

/**
 * Newest already-ingested, not-yet-superseded event for a Whoop base id
 * (excluding the revision we are about to write, so replays stay stable).
 */
async function findLatestWhoopEvent(
  baseExternalId: string,
  excludeExternalId: string,
): Promise<{ eventId: string; recordedAt: Date } | null> {
  const rows = await db
    .select({ eventId: event.eventId, recordedAt: event.recordedAt })
    .from(event)
    .where(
      and(
        eq(event.source, "whoop"),
        sql`(${event.externalId} = ${baseExternalId} OR ${event.externalId} LIKE ${baseExternalId + ":rev%"})`,
        sql`${event.externalId} <> ${excludeExternalId}`,
        eq(event.isSuperseded, false),
      ),
    )
    .orderBy(desc(event.ingestedAt))
    .limit(1);
  return rows[0] ?? null;
}
