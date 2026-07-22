import type { WhoopClient } from "../src/ingest/whoop.js";
import type { SeedAthlete } from "./athletes.js";

/**
 * Deterministic Whoop v2 fixture client. Generates physiologically plausible
 * sleep/recovery/cycle/workout records for one athlete-day, driven by a
 * seeded PRNG — same seed, same 90 days, every run.
 */

/** mulberry32 — small deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (rand: () => number): number => {
  // Box-Muller, one draw.
  const u = Math.max(rand(), 1e-9);
  const v = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export interface DayRecords {
  sleep: unknown;
  recovery: unknown;
  cycle: unknown;
  workout: unknown | null;
  /** Derived values the simulator needs for self-reports & assertions. */
  derived: { recoveryScore: number; sleepMin: number; inPatch: boolean };
}

export function generateDay(
  athlete: SeedAthlete,
  windowStart: Date,
  day: number,
  rand: () => number,
): DayRecords {
  const p = athlete.physiology;
  const inPatch = p.roughPatches.some(
    (rp) => day >= rp.startDay && day < rp.startDay + rp.days,
  );

  // A rough patch drags sleep down and stresses the autonomic markers.
  const sleepMin = Math.max(
    280,
    Math.round(p.sleepMeanMin + gauss(rand) * 35 - (inPatch ? 65 : 0)),
  );
  const hrv = Math.max(
    20,
    p.hrvBaseMs * (inPatch ? 0.72 : 1) + gauss(rand) * 6,
  );
  const rhr = p.rhrBaseBpm * (inPatch ? 1.09 : 1) + gauss(rand) * 1.5;

  // Recovery score loosely follows HRV vs. baseline and sleep debt.
  const hrvRatio = hrv / p.hrvBaseMs;
  const sleepRatio = sleepMin / 450;
  let recoveryScore = Math.round(
    Math.min(99, Math.max(5, 62 * hrvRatio + 30 * sleepRatio + gauss(rand) * 6 - 22)),
  );
  if (inPatch) recoveryScore = Math.min(recoveryScore, 30 + Math.round(rand() * 8));

  const dayStart = new Date(windowStart.getTime() + day * 86_400_000);
  const iso = (offsetMin: number) =>
    new Date(dayStart.getTime() + offsetMin * 60_000).toISOString();

  const sleepStart = iso(-60); // 23:00 previous night
  const sleepEnd = iso(-60 + sleepMin + 25);
  const wakeCreated = iso(-60 + sleepMin + 40);

  const remMin = Math.round(sleepMin * (0.2 + rand() * 0.05));
  const swsMin = Math.round(sleepMin * (0.18 + rand() * 0.05));
  const awakeMin = 15 + Math.round(rand() * 20);

  const sleep = {
    id: `sl-${athlete.physiology.seed}-${day}`,
    start: sleepStart,
    end: sleepEnd,
    created_at: wakeCreated,
    updated_at: wakeCreated,
    nap: false,
    score_state: "SCORED",
    score: {
      stage_summary: {
        total_in_bed_time_milli: (sleepMin + awakeMin) * 60_000,
        total_awake_time_milli: awakeMin * 60_000,
        total_light_sleep_time_milli: (sleepMin - remMin - swsMin) * 60_000,
        total_slow_wave_sleep_time_milli: swsMin * 60_000,
        total_rem_sleep_time_milli: remMin * 60_000,
      },
      sleep_performance_percentage: Math.min(100, Math.round((sleepMin / 460) * 100)),
      sleep_efficiency_percentage: Math.round((sleepMin / (sleepMin + awakeMin)) * 1000) / 10,
    },
  };

  const recovery = {
    cycle_id: p.seed * 1000 + day,
    sleep_id: `sl-${p.seed}-${day}`,
    created_at: wakeCreated,
    updated_at: wakeCreated,
    score_state: "SCORED",
    score: {
      recovery_score: recoveryScore,
      hrv_rmssd_milli: Math.round(hrv * 10) / 10,
      resting_heart_rate: Math.round(rhr),
      spo2_percentage: Math.round((96 + rand() * 2.5) * 10) / 10,
      skin_temp_celsius: Math.round((33.5 + gauss(rand) * 0.4) * 10) / 10,
    },
  };

  const isWorkoutDay = p.workoutDays.includes(day % 7);
  // Athletes with low recovery sometimes skip; deterministic via rand.
  const skips = inPatch && rand() < 0.4;
  const doWorkout = isWorkoutDay && !skips;

  const workoutMin = 45 + Math.round(rand() * 90);
  const workoutStrain = Math.round((8 + rand() * 8 + (workoutMin - 45) / 20) * 10) / 10;

  const workout = doWorkout
    ? {
        id: `wo-${p.seed}-${day}`,
        sport_name: p.sport,
        start: iso(17 * 60),
        end: iso(17 * 60 + workoutMin),
        created_at: iso(17 * 60 + workoutMin + 20),
        updated_at: iso(17 * 60 + workoutMin + 20),
        score_state: "SCORED",
        score: {
          strain: Math.min(21, workoutStrain),
          average_heart_rate: 132 + Math.round(rand() * 25),
          max_heart_rate: 165 + Math.round(rand() * 20),
          kilojoule: Math.round(workoutMin * (28 + rand() * 12)),
          distance_meter:
            p.sport === "running"
              ? Math.round(workoutMin * (150 + rand() * 60))
              : Math.round(workoutMin * (450 + rand() * 150)),
        },
      }
    : null;

  const dayStrain = Math.min(
    21,
    Math.round(((doWorkout ? workoutStrain : 4) + rand() * 3) * 10) / 10,
  );
  const cycle = {
    id: p.seed * 1000 + day,
    start: iso(4 * 60),
    end: iso(28 * 60),
    created_at: iso(28 * 60 + 30),
    updated_at: iso(28 * 60 + 30),
    score_state: "SCORED",
    score: {
      strain: dayStrain,
      average_heart_rate: 62 + Math.round(rand() * 10),
      max_heart_rate: workout ? 165 + Math.round(rand() * 20) : 120 + Math.round(rand() * 20),
      kilojoule: Math.round(7000 + rand() * 4000),
    },
  };

  return {
    sleep,
    recovery,
    cycle,
    workout,
    derived: { recoveryScore, sleepMin, inPatch },
  };
}

/**
 * WhoopClient backed by pre-generated day records — the adapter under test
 * is the REAL one; only the transport is fake.
 */
export class FixtureWhoopClient implements WhoopClient {
  constructor(
    private readonly records: {
      sleeps: unknown[];
      recoveries: unknown[];
      cycles: unknown[];
      workouts: unknown[];
    },
  ) {}

  async getSleeps(): Promise<unknown[]> {
    return this.records.sleeps;
  }
  async getRecoveries(): Promise<unknown[]> {
    return this.records.recoveries;
  }
  async getCycles(): Promise<unknown[]> {
    return this.records.cycles;
  }
  async getWorkouts(): Promise<unknown[]> {
    return this.records.workouts;
  }
}
