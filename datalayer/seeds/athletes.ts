/**
 * Three fictional Nordic amateur endurance athletes. Fixed UUIDs so the
 * seed is re-runnable (the runner erases and recreates them).
 *
 * The physiological parameters drive the deterministic generator: baseline
 * HRV/RHR/sleep, weekly training rhythm, and "rough patches" — stretches of
 * poor recovery that make the Precision Loop's rule fire realistically.
 */

export interface RoughPatch {
  /** Day offset from the start of the 90-day window. */
  startDay: number;
  days: number;
}

export interface SeedAthlete {
  userId: string;
  displayName: string;
  email: string;
  timezone: string;
  locale: string;
  disciplines: Array<{ discipline: string; isPrimary: boolean }>;
  baseline: {
    trainingAgeYears: number;
    weeklyHoursAvg: number;
    historySummary: string;
  };
  thresholds: Array<{ kind: string; value: number; unit: string; method: string }>;
  /** Day offset (from window start) for the goal event date. */
  goals: Array<{ name: string; dayOffset: number; eventType: string; priority: "A" | "B" | "C" }>;
  preferences: Array<{ key: string; value: unknown }>;
  /** Consent to cold-start similarity is deliberately varied. */
  consentColdStart: boolean;
  physiology: {
    seed: number;
    hrvBaseMs: number;
    rhrBaseBpm: number;
    sleepMeanMin: number;
    /** 0..6, days of week with workouts (0 = window start weekday). */
    workoutDays: number[];
    sport: string;
    roughPatches: RoughPatch[];
    /** How reliably they complete protocols: 0..1. */
    adherenceRate: number;
  };
}

export const SEED_ATHLETES: SeedAthlete[] = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Freja Lindqvist",
    email: "freja.lindqvist@example.dk",
    timezone: "Europe/Copenhagen",
    locale: "da-DK",
    disciplines: [
      { discipline: "triathlon", isPrimary: true },
      { discipline: "running", isPrimary: false },
    ],
    baseline: {
      trainingAgeYears: 7,
      weeklyHoursAvg: 11.5,
      historySummary:
        "Two 70.3 finishes; structured training with a coach since 2023.",
    },
    thresholds: [
      { kind: "ftp_watts", value: 245, unit: "W", method: "field_test" },
      { kind: "lthr_bpm", value: 168, unit: "bpm", method: "field_test" },
      { kind: "run_threshold_pace_sec_per_km", value: 265, unit: "s/km", method: "field_test" },
    ],
    goals: [
      { name: "Ironman 70.3 Elsinore", dayOffset: 120, eventType: "triathlon_70_3", priority: "A" },
      { name: "Copenhagen Half", dayOffset: 75, eventType: "half_marathon", priority: "B" },
    ],
    preferences: [
      { key: "tools_in_use", value: ["whoop", "trainingpeaks", "zwift"] },
      { key: "morning_person", value: true },
      { key: "no_caffeine_after", value: "14:00" },
    ],
    consentColdStart: true,
    physiology: {
      seed: 101,
      hrvBaseMs: 78,
      rhrBaseBpm: 46,
      sleepMeanMin: 415, // ~6.9h — close enough to trip the sleep rule in bad weeks
      workoutDays: [0, 1, 2, 4, 5, 6],
      sport: "cycling",
      roughPatches: [
        { startDay: 22, days: 5 },
        { startDay: 58, days: 4 },
      ],
      adherenceRate: 0.9,
    },
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    displayName: "Mikkel Østergaard",
    email: "mikkel.oestergaard@example.dk",
    timezone: "Europe/Copenhagen",
    locale: "da-DK",
    disciplines: [
      { discipline: "gravel", isPrimary: true },
      { discipline: "road_cycling", isPrimary: false },
    ],
    baseline: {
      trainingAgeYears: 3.5,
      weeklyHoursAvg: 7,
      historySummary:
        "Came from CrossFit in 2023; self-coached, races the Danish gravel series.",
    },
    thresholds: [
      { kind: "ftp_watts", value: 282, unit: "W", method: "estimated" },
      { kind: "max_hr_bpm", value: 192, unit: "bpm", method: "self_reported" },
    ],
    goals: [
      { name: "Gravel Rally Mols Bjerge", dayOffset: 95, eventType: "gravel_race_140km", priority: "A" },
    ],
    preferences: [
      { key: "tools_in_use", value: ["whoop", "strava"] },
      { key: "morning_person", value: false },
      { key: "trains_after_work", value: true },
    ],
    consentColdStart: false, // deliberately: granular consent must actually vary
    physiology: {
      seed: 202,
      hrvBaseMs: 62,
      rhrBaseBpm: 52,
      sleepMeanMin: 395, // ~6.6h — chronically short sleeper
      workoutDays: [1, 3, 5, 6],
      sport: "cycling",
      roughPatches: [
        { startDay: 35, days: 6 },
        { startDay: 70, days: 5 },
      ],
      adherenceRate: 0.55,
    },
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    displayName: "Ingrid Sølvberg",
    email: "ingrid.soelvberg@example.no",
    timezone: "Europe/Oslo",
    locale: "nb-NO",
    disciplines: [{ discipline: "trail_running", isPrimary: true }],
    baseline: {
      trainingAgeYears: 12,
      weeklyHoursAvg: 9,
      historySummary:
        "Long ultra background; several 50k+ mountain races, prone to overreaching.",
    },
    thresholds: [
      { kind: "run_threshold_pace_sec_per_km", value: 285, unit: "s/km", method: "lab_test" },
      { kind: "lthr_bpm", value: 172, unit: "bpm", method: "lab_test" },
      { kind: "vo2max_est", value: 54, unit: "ml/kg/min", method: "lab_test" },
    ],
    goals: [
      { name: "Hardangervidda 55k", dayOffset: 110, eventType: "trail_ultra_55k", priority: "A" },
      { name: "Oslo Night Trail", dayOffset: 45, eventType: "trail_race_25k", priority: "C" },
    ],
    preferences: [
      { key: "tools_in_use", value: ["whoop", "garmin_connect"] },
      { key: "prefers_evening_sessions", value: false },
      { key: "injury_history", value: ["achilles_tendinopathy_2024"] },
    ],
    consentColdStart: true,
    physiology: {
      seed: 303,
      hrvBaseMs: 85,
      rhrBaseBpm: 44,
      sleepMeanMin: 425, // ~7.1h
      workoutDays: [0, 2, 3, 5, 6],
      sport: "running",
      roughPatches: [
        { startDay: 12, days: 4 },
        { startDay: 47, days: 6 },
        { startDay: 80, days: 4 },
      ],
      adherenceRate: 0.75,
    },
  },
];
