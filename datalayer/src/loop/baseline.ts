import type {
  EffectMeasurer,
  GeneratedIntervention,
  InterventionGenerator,
} from "./index.js";

/**
 * Baseline rule-based generator + effect measurer.
 *
 * These are the simplest useful implementations of the pluggable slots in
 * the Precision Loop — enough to run the loop end-to-end (seeds, tests)
 * and to be honest about what the system can claim. A model-backed
 * generator replaces `ruleBasedGenerator` later without touching stores.
 */

const MODEL_VERSION = "rule-based/0.1";
const PROMPT_VERSION = "n/a";

/**
 * Rule: if the latest recovery score is < 40 and the 7-day average sleep is
 * below 7h, propose a sleep-extension protocol for tonight, hypothesizing
 * an HRV rebound within 48h.
 */
export const ruleBasedGenerator: InterventionGenerator = async (snapshot) => {
  const recoveries = snapshot.recentEvents
    .filter((e) => e.eventType === "biometric.recovery")
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const latest = recoveries[0];
  if (!latest) return null;

  const score = (latest.payload as { recovery_score?: number }).recovery_score;
  if (score == null || score >= 40) return null;

  const sleeps = snapshot.recentEvents.filter(
    (e) =>
      e.eventType === "biometric.sleep" &&
      !(e.payload as { is_nap?: boolean }).is_nap,
  );
  const avgSleepMin =
    sleeps.length > 0
      ? sleeps.reduce(
          (sum, e) =>
            sum + ((e.payload as { duration_min?: number }).duration_min ?? 0),
          0,
        ) / sleeps.length
      : null;
  if (avgSleepMin == null || avgSleepMin >= 7 * 60) return null;

  // Patterns about HRV/sleep the user already has strengthen the case; we
  // cite them (frozen) but the rule fires regardless — with an honest
  // hypothesis either way.
  const supportingPatterns = snapshot.patterns.filter(
    (p) =>
      (p.antecedent as { metric?: string }).metric === "sleep_duration_min" ||
      (p.consequent as { metric?: string }).metric === "hrv_rmssd_ms",
  );

  const generated: GeneratedIntervention = {
    interventionType: "recovery.sleep_extension",
    content: {
      protocol_id: "sleep-extension-v1",
      title: "Sleep extension tonight",
      steps: [
        { step: "in_bed_by", detail: "In bed 60 minutes earlier than usual" },
        { step: "no_screens", detail: "No screens for the last 30 minutes" },
        { step: "cool_room", detail: "Bedroom at or below 19°C" },
      ],
    },
    hypothesis: {
      expected_outcome:
        "Recovery score rebounds above 55 within the outcome window",
      rationale:
        avgSleepMin < 6.5 * 60
          ? "Recovery < 40 with 7-day sleep well under 7h; sleep debt is the most likely limiter"
          : "Recovery < 40 with sleep slightly under 7h; extension is the lowest-cost lever",
      metric: "recovery_score",
      expected_direction: "increase",
      expected_magnitude_pct: 25,
    },
    basedOnPatternIds: supportingPatterns.map((p) => p.patternId),
    outcomeWindowHours: 48,
    modelVersion: MODEL_VERSION,
    promptVersion: PROMPT_VERSION,
  };
  return generated;
};

/**
 * Compares the hypothesis metric inside the outcome window against the
 * baseline captured in the frozen trigger_context. Deliberately blunt:
 * fewer than 2 in-window observations => inconclusive, never a guess.
 */
export const simpleEffectMeasurer: EffectMeasurer = async ({
  hypothesis,
  windowEvents,
  triggerContext,
}) => {
  const metricOf = (payload: unknown): number | null => {
    const p = payload as Record<string, unknown>;
    const v = p[hypothesis.metric];
    return typeof v === "number" ? v : null;
  };

  const inWindow = windowEvents
    .map((e) => ({ ...e, value: metricOf(e.payload) }))
    .filter((e): e is typeof e & { value: number } => e.value !== null);

  const ctx = triggerContext as {
    recent_events?: Array<{ payload?: unknown }>;
  };
  const baselineValues = (ctx.recent_events ?? [])
    .map((e) => metricOf(e.payload))
    .filter((v): v is number => v !== null);
  const baseline =
    baselineValues.length > 0
      ? baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length
      : null;

  if (inWindow.length < 2 || baseline === null) {
    return {
      metric: hypothesis.metric,
      direction: "stable",
      baseline_value: baseline,
      observed_value: inWindow[0]?.value ?? null,
      magnitude_pct: null,
      method: "pre-post-mean/v1 (insufficient data)",
      outcome: "inconclusive",
      evidenceEventIds: inWindow.map((e) => ({
        eventId: e.eventId,
        recordedAt: e.recordedAt,
      })),
    };
  }

  const observed = inWindow.reduce((a, b) => a + b.value, 0) / inWindow.length;
  const magnitudePct = baseline === 0 ? 0 : ((observed - baseline) / Math.abs(baseline)) * 100;
  const direction =
    Math.abs(magnitudePct) < 5
      ? ("stable" as const)
      : magnitudePct > 0
        ? ("increase" as const)
        : ("decrease" as const);

  const directionMatches = direction === hypothesis.expected_direction;
  const magnitudeMet =
    hypothesis.expected_magnitude_pct == null ||
    Math.abs(magnitudePct) >= hypothesis.expected_magnitude_pct;

  return {
    metric: hypothesis.metric,
    direction,
    baseline_value: Math.round(baseline * 100) / 100,
    observed_value: Math.round(observed * 100) / 100,
    magnitude_pct: Math.round(magnitudePct * 10) / 10,
    method: "pre-post-mean/v1",
    outcome: directionMatches
      ? magnitudeMet
        ? "confirmed"
        : "partially_confirmed"
      : "refuted",
    evidenceEventIds: inWindow.map((e) => ({
      eventId: e.eventId,
      recordedAt: e.recordedAt,
    })),
  };
};
