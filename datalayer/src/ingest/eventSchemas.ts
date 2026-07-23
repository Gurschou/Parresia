import { z } from "zod";

/**
 * Payload schemas per event_type — the write boundary of the Event Log.
 *
 * Every schema is .strict(): unknown keys are REJECTED, not stripped. This
 * is the first layer of the no-PII guarantee — a payload physically cannot
 * carry a name/email/phone field into the Event Log, because only the keys
 * listed here exist. Free-text fields ("note") are additionally passed
 * through the redaction layer (src/privacy/redaction.ts) before storage.
 *
 * schema_version on the event row records which version of these schemas
 * validated the payload. Bump SCHEMA_VERSION when a schema changes shape.
 */

export const SCHEMA_VERSION = 1;

/** Subjective 1..10 self-report scale, shared by all state.* events. */
const selfReportScale = z.number().int().min(1).max(10);
const note = z.string().max(2000).optional();

export const eventPayloadSchemas = {
  // --- Biometrics (Whoop et al.) --------------------------------------
  "biometric.sleep": z
    .object({
      duration_min: z.number().nonnegative(),
      time_in_bed_min: z.number().nonnegative().optional(),
      sleep_efficiency_pct: z.number().min(0).max(100).optional(),
      sleep_performance_pct: z.number().min(0).max(100).optional(),
      rem_min: z.number().nonnegative().optional(),
      sws_min: z.number().nonnegative().optional(),
      light_min: z.number().nonnegative().optional(),
      awake_min: z.number().nonnegative().optional(),
      is_nap: z.boolean().optional(),
    })
    .strict(),

  "biometric.recovery": z
    .object({
      recovery_score: z.number().min(0).max(100),
      hrv_rmssd_ms: z.number().positive(),
      resting_hr_bpm: z.number().positive(),
      spo2_pct: z.number().min(0).max(100).optional(),
      skin_temp_c: z.number().optional(),
    })
    .strict(),

  /** Whole-day cardiovascular load (Whoop cycle strain). */
  "biometric.strain": z
    .object({
      strain: z.number().min(0).max(21),
      avg_hr_bpm: z.number().positive().optional(),
      max_hr_bpm: z.number().positive().optional(),
      kilojoules: z.number().nonnegative().optional(),
    })
    .strict(),

  // --- Training sessions & races --------------------------------------
  "workout.session": z
    .object({
      sport: z.string(),
      duration_min: z.number().positive(),
      strain: z.number().min(0).max(21).optional(),
      avg_hr_bpm: z.number().positive().optional(),
      max_hr_bpm: z.number().positive().optional(),
      distance_km: z.number().nonnegative().optional(),
      avg_power_watts: z.number().nonnegative().optional(),
      normalized_power_watts: z.number().nonnegative().optional(),
      kilojoules: z.number().nonnegative().optional(),
      is_race: z.boolean().optional(),
      /** 1..10 subjective session quality (self-reported afterwards). */
      perceived_quality: selfReportScale.optional(),
      rpe: z.number().min(1).max(10).optional(),
    })
    .strict(),

  // --- Self-reported states --------------------------------------------
  "state.energy": z.object({ value: selfReportScale, note }).strict(),
  "state.mood": z.object({ value: selfReportScale, note }).strict(),
  "state.motivation": z.object({ value: selfReportScale, note }).strict(),
  "state.pain": z
    .object({
      value: selfReportScale,
      location: z.string().max(100).optional(),
      note,
    })
    .strict(),

  // --- Protocol execution ----------------------------------------------
  "protocol.step_completed": z
    .object({
      /** The intervention this step belongs to, when applicable. */
      intervention_id: z.string().uuid().optional(),
      protocol_id: z.string(),
      step: z.string(),
      status: z.enum(["completed", "partial", "skipped"]),
      note,
    })
    .strict(),
} as const;

export type EventType = keyof typeof eventPayloadSchemas;

export const eventTypeSchema = z.enum(
  Object.keys(eventPayloadSchemas) as [EventType, ...EventType[]],
);

export function validatePayload(eventType: string, payload: unknown): unknown {
  const type = eventTypeSchema.parse(eventType);
  return eventPayloadSchemas[type].parse(payload);
}
