import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { intervention, interventionEffectEvidence, interventionPattern } from "../../schema/ledger.js";
import { event } from "../../schema/events.js";
import { getTwinSnapshot, type TwinSnapshot } from "../twin/index.js";
import { hasConsent } from "../privacy/consent.js";
import { ingestEvents } from "../ingest/pipeline.js";
import { buildTriggerContext } from "./triggerContext.js";
import {
  recordObservation,
  type Antecedent,
  type Consequent,
} from "./patternService.js";

/**
 * PRECISION LOOP — a service layer over the four stores, no persistence of
 * its own. Runs for ONE user in isolation; nothing here aggregates across
 * users.
 *
 *   1. PRE-PROTOCOL   issueIntervention(): twin snapshot -> generator ->
 *                      ledger insert with FROZEN trigger_context.
 *   2. DURING         recordAdherence(): protocol events -> Event Log,
 *                      write-once adherence on the ledger row.
 *   3. POST-PROTOCOL  measureOutcomes(): after the outcome window closes,
 *                      compute measured_effect from the Event Log, fill the
 *                      write-once outcome columns, and feed the result back
 *                      into the Pattern Graph with adjusted confidence.
 */

// ---------------------------------------------------------------------------
// The intervention generator is pluggable: rule-based now, model-backed
// later. It receives the twin snapshot (PII-free by construction) and
// returns what to do plus a falsifiable hypothesis.
// ---------------------------------------------------------------------------

export const hypothesisSchema = z
  .object({
    expected_outcome: z.string(),
    rationale: z.string(),
    metric: z.string(),
    expected_direction: z.enum(["increase", "decrease", "stable"]),
    expected_magnitude_pct: z.number().optional(),
  })
  .strict();

export type Hypothesis = z.infer<typeof hypothesisSchema>;

export interface GeneratedIntervention {
  interventionType: string;
  content: Record<string, unknown>;
  hypothesis: Hypothesis;
  /** Patterns the decision was built on (frozen into the junction table). */
  basedOnPatternIds: string[];
  outcomeWindowHours: number;
  modelVersion: string;
  promptVersion: string;
}

export type InterventionGenerator = (
  snapshot: TwinSnapshot,
) => Promise<GeneratedIntervention | null>;

// ---------------------------------------------------------------------------
// 1. Pre-protocol
// ---------------------------------------------------------------------------

export async function issueIntervention(
  userId: string,
  generate: InterventionGenerator,
  atTime: Date = new Date(),
): Promise<{ interventionId: string } | null> {
  // Interventions are personalization built on health data: art. 9 consent
  // for both the biometric category and derived patterns is required.
  const [biometricOk, patternOk] = await Promise.all([
    hasConsent(userId, "biometric", "personalization"),
    hasConsent(userId, "derived_pattern", "personalization"),
  ]);
  if (!biometricOk || !patternOk) return null;

  const snapshot = await getTwinSnapshot(userId, atTime);
  const generated = await generate(snapshot);
  if (!generated) return null;

  // One open intervention per type at a time: if a previous intervention of
  // this type is still inside its outcome window (unmeasured), issuing
  // another would make both unmeasurable.
  const [open] = await db
    .select({ id: intervention.interventionId })
    .from(intervention)
    .where(
      and(
        eq(intervention.userId, userId),
        eq(intervention.interventionType, generated.interventionType),
        isNull(intervention.hypothesisOutcome),
        sql`upper(${intervention.outcomeWindow}) > ${atTime.toISOString()}::timestamptz`,
      ),
    )
    .limit(1);
  if (open) return null;

  const hypothesis = hypothesisSchema.parse(generated.hypothesis);
  const triggerContext = buildTriggerContext(snapshot);
  const windowStart = atTime;
  const windowEnd = new Date(
    atTime.getTime() + generated.outcomeWindowHours * 3600 * 1000,
  );

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(intervention)
      .values({
        userId,
        issuedAt: atTime,
        triggerContext,
        hypothesis,
        interventionType: generated.interventionType,
        content: generated.content,
        modelVersion: generated.modelVersion,
        promptVersion: generated.promptVersion,
        outcomeWindow: `[${windowStart.toISOString()},${windowEnd.toISOString()})`,
      })
      .returning({ interventionId: intervention.interventionId });

    // Freeze the pattern state the decision was built on.
    const patternsAtIssue = snapshot.patterns.filter((p) =>
      generated.basedOnPatternIds.includes(p.patternId),
    );
    if (patternsAtIssue.length > 0) {
      await tx.insert(interventionPattern).values(
        patternsAtIssue.map((p) => ({
          interventionId: row!.interventionId,
          patternId: p.patternId,
          confidenceAtIssue: p.confidence,
          nAtIssue: p.observationCount,
        })),
      );
    }
    return { interventionId: row!.interventionId };
  });
}

/** Write-once delivery bookkeeping (rejected by trigger if already set). */
export async function recordDelivery(
  interventionId: string,
  channel: "push" | "email" | "in_app" | "sms",
  deliveredAt: Date = new Date(),
): Promise<void> {
  await db
    .update(intervention)
    .set({ deliveryChannel: channel, deliveredAt })
    .where(eq(intervention.interventionId, interventionId));
}

export async function recordSeen(
  interventionId: string,
  seenAt: Date = new Date(),
): Promise<void> {
  await db
    .update(intervention)
    .set({ seenAt })
    .where(eq(intervention.interventionId, interventionId));
}

// ---------------------------------------------------------------------------
// 2. During protocol
// ---------------------------------------------------------------------------

/**
 * Adherence lands in TWO places by design: the raw protocol events go to
 * the Event Log (append-only source of truth), and the summary verdict is
 * written once onto the ledger row so outcome analysis never needs to
 * re-derive it.
 */
export async function recordAdherence(params: {
  userId: string;
  interventionId: string;
  protocolId: string;
  steps: Array<{
    step: string;
    status: "completed" | "partial" | "skipped";
    at: Date;
    note?: string;
  }>;
}): Promise<void> {
  await ingestEvents(
    params.steps.map((s) => ({
      userId: params.userId,
      source: "protocol" as const,
      externalId: `protocol-${params.interventionId}-${s.step}-${randomUUID()}`,
      eventType: "protocol.step_completed" as const,
      recordedAt: s.at,
      payload: {
        intervention_id: params.interventionId,
        protocol_id: params.protocolId,
        step: s.step,
        status: s.status,
        ...(s.note && { note: s.note }),
      },
    })),
  );

  const statuses = params.steps.map((s) => s.status);
  const adherence = statuses.every((s) => s === "completed")
    ? ("full" as const)
    : statuses.every((s) => s === "skipped")
      ? ("none" as const)
      : ("partial" as const);

  await db
    .update(intervention)
    .set({ adherence, adherenceRecordedAt: new Date() })
    .where(eq(intervention.interventionId, params.interventionId));
}

// ---------------------------------------------------------------------------
// 3. Post-protocol
// ---------------------------------------------------------------------------

/**
 * The effect measurement is pluggable for the same reason the generator is.
 * It receives the events inside the outcome window plus the frozen
 * hypothesis, returns the measured effect and its verdict.
 */
export interface MeasuredEffect {
  metric: string;
  direction: "increase" | "decrease" | "stable";
  baseline_value: number | null;
  observed_value: number | null;
  magnitude_pct: number | null;
  method: string;
  outcome: "confirmed" | "partially_confirmed" | "refuted" | "inconclusive";
  evidenceEventIds: Array<{ eventId: string; recordedAt: Date }>;
}

export type EffectMeasurer = (params: {
  hypothesis: Hypothesis;
  windowEvents: Array<{
    eventId: string;
    eventType: string;
    recordedAt: Date;
    payload: unknown;
  }>;
  triggerContext: unknown;
}) => Promise<MeasuredEffect>;

/**
 * Close the loop for every intervention of ONE user whose outcome window
 * has ended but whose effect is unmeasured: fill the write-once outcome
 * columns and feed the verdict back into the Pattern Graph — supporting
 * observations for confirmed hypotheses, contradicting for refuted ones.
 */
export async function measureOutcomes(
  userId: string,
  measure: EffectMeasurer,
  now: Date = new Date(),
): Promise<Array<{ interventionId: string; outcome: string }>> {
  const due = await db
    .select()
    .from(intervention)
    .where(
      and(
        eq(intervention.userId, userId),
        isNull(intervention.hypothesisOutcome),
        sql`upper(${intervention.outcomeWindow}) <= ${now.toISOString()}::timestamptz`,
      ),
    );

  const results: Array<{ interventionId: string; outcome: string }> = [];

  for (const row of due) {
    const windowEvents = await db
      .select({
        eventId: event.eventId,
        eventType: event.eventType,
        recordedAt: event.recordedAt,
        payload: event.payload,
      })
      .from(event)
      .where(
        and(
          eq(event.userId, userId),
          eq(event.isSuperseded, false),
          sql`${event.recordedAt} <@ ${row.outcomeWindow}::tstzrange`,
        ),
      )
      .orderBy(event.recordedAt);

    const hypothesis = hypothesisSchema.parse(row.hypothesis);
    const effect = await measure({
      hypothesis,
      windowEvents,
      triggerContext: row.triggerContext,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(intervention)
        .set({
          measuredEffect: {
            metric: effect.metric,
            direction: effect.direction,
            baseline_value: effect.baseline_value,
            observed_value: effect.observed_value,
            magnitude_pct: effect.magnitude_pct,
            method: effect.method,
          },
          hypothesisOutcome: effect.outcome,
          effectMeasuredAt: now,
        })
        .where(eq(intervention.interventionId, row.interventionId));

      if (effect.evidenceEventIds.length > 0) {
        await tx
          .insert(interventionEffectEvidence)
          .values(
            effect.evidenceEventIds.map((ev) => ({
              interventionId: row.interventionId,
              eventId: ev.eventId,
              recordedAt: ev.recordedAt,
            })),
          )
          .onConflictDoNothing();
      }
    });

    // Feed the verdict back into the Pattern Graph. Inconclusive outcomes
    // deliberately do NOT move pattern confidence.
    if (effect.outcome !== "inconclusive") {
      const supporting =
        effect.outcome === "confirmed" ||
        effect.outcome === "partially_confirmed";
      const antecedent: Antecedent = {
        metric: "intervention_issued",
        relation: "above_value",
        value: 0,
        window_hours: 1,
      };
      const consequent: Consequent = {
        metric: hypothesis.metric,
        direction: hypothesis.expected_direction,
        ...(hypothesis.expected_magnitude_pct != null && {
          magnitude_pct: hypothesis.expected_magnitude_pct,
        }),
        window_hours: Math.max(
          1,
          Math.round(
            (upperOfRange(String(row.outcomeWindow)).getTime() -
              row.issuedAt.getTime()) /
              3_600_000,
          ),
        ),
      };
      await recordObservation({
        userId,
        antecedent: {
          ...antecedent,
          metric: `intervention.${row.interventionType}`,
        },
        consequent,
        supporting,
        observedAt: now,
        strength:
          effect.magnitude_pct != null
            ? Math.max(-1, Math.min(1, effect.magnitude_pct / 100)) *
              (supporting ? 1 : -1)
            : supporting
              ? 0.1
              : -0.1,
        evidence: effect.evidenceEventIds.map((ev) => ({
          eventId: ev.eventId,
          recordedAt: ev.recordedAt,
          role: "outcome" as const,
        })),
      });
    }

    results.push({ interventionId: row.interventionId, outcome: effect.outcome });
  }

  return results;
}

/** Parse the upper bound out of a Postgres tstzrange literal. */
function upperOfRange(range: string): Date {
  const match = range.match(/[,]\s*"?([^")\]]+)"?[)\]]$/);
  if (!match?.[1]) throw new Error(`cannot parse range: ${range}`);
  return new Date(match[1]);
}
