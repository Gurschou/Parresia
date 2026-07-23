import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { pattern, patternEvidence } from "../../schema/patterns.js";

/**
 * PatternService — the only writer of the Pattern Graph.
 *
 * Central rule, enforced here and by a DB CHECK constraint: a pattern's
 * status is DERIVED from (observation_count, confidence) and n < 5 can
 * never leave "hypothesis". The system must never present an n=2
 * correlation as knowledge; every read of a pattern carries confidence AND
 * n so downstream consumers can't drop the caveat.
 */

export const antecedentSchema = z
  .object({
    metric: z.string(),
    relation: z.enum([
      "below_baseline_pct",
      "above_baseline_pct",
      "below_value",
      "above_value",
    ]),
    value: z.number(),
    window_hours: z.number().positive(),
  })
  .strict();

export const consequentSchema = z
  .object({
    metric: z.string(),
    direction: z.enum(["increase", "decrease", "stable"]),
    magnitude_pct: z.number().optional(),
    window_hours: z.number().positive(),
  })
  .strict();

export type Antecedent = z.infer<typeof antecedentSchema>;
export type Consequent = z.infer<typeof consequentSchema>;

/** Canonical digest so the same correlation maps to the same row forever. */
export function semanticKey(a: Antecedent, c: Consequent): string {
  const canonical = JSON.stringify({
    a: Object.fromEntries(Object.entries(a).sort()),
    c: Object.fromEntries(Object.entries(c).sort()),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function deriveStatus(
  observationCount: number,
  confidence: number,
): "hypothesis" | "emerging" | "established" {
  if (observationCount >= 10 && confidence >= 0.7) return "established";
  if (observationCount >= 5 && confidence >= 0.5) return "emerging";
  return "hypothesis";
}

/**
 * Bayesian-flavored confidence update: each new observation nudges
 * confidence toward 1 (supporting) or 0 (contradicting) with a step that
 * shrinks as n grows. Simple, monotone in evidence, and — importantly —
 * recomputable from the evidence table if we ever change the model.
 */
export function adjustConfidence(
  current: number,
  n: number,
  supporting: boolean,
): number {
  const step = 1 / (n + 2);
  const target = supporting ? 1 : 0;
  const next = current + (target - current) * step;
  return Math.round(next * 1000) / 1000;
}

export interface ObservationInput {
  userId: string;
  antecedent: Antecedent;
  consequent: Consequent;
  /** Did this observation SUPPORT the correlation? */
  supporting: boolean;
  observedAt: Date;
  /** Effect size seen in this observation, normalized -1..1. */
  strength: number;
  evidence: Array<{
    eventId: string;
    recordedAt: Date;
    role: "antecedent" | "outcome";
    weight?: number;
  }>;
}

/**
 * Record one observation of a correlation: create the pattern at
 * hypothesis-level confidence if new, otherwise update n/confidence/status
 * in place (the Pattern Graph is derived state; see schema/patterns.ts).
 */
export async function recordObservation(
  input: ObservationInput,
): Promise<{ patternId: string; confidence: number; n: number; status: string }> {
  const antecedent = antecedentSchema.parse(input.antecedent);
  const consequent = consequentSchema.parse(input.consequent);
  const key = semanticKey(antecedent, consequent);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pattern)
      .where(and(eq(pattern.userId, input.userId), eq(pattern.semanticKey, key)))
      .for("update");

    let patternId: string;
    let confidence: number;
    let n: number;
    let status: string;

    if (!existing) {
      // New correlations start life as low-confidence hypotheses, always.
      confidence = input.supporting ? 0.3 : 0.1;
      n = 1;
      status = "hypothesis";
      const [created] = await tx
        .insert(pattern)
        .values({
          userId: input.userId,
          antecedent,
          consequent,
          strength: String(input.strength),
          confidence: String(confidence),
          observationCount: n,
          status: "hypothesis",
          firstObservedAt: input.observedAt,
          lastObservedAt: input.observedAt,
          semanticKey: key,
        })
        .returning({ patternId: pattern.patternId });
      patternId = created!.patternId;
    } else {
      n = existing.observationCount + 1;
      confidence = adjustConfidence(
        Number(existing.confidence),
        existing.observationCount,
        input.supporting,
      );
      status = deriveStatus(n, confidence);
      // Running average of effect size.
      const strength =
        (Number(existing.strength) * existing.observationCount +
          input.strength) /
        n;
      await tx
        .update(pattern)
        .set({
          confidence: String(confidence),
          observationCount: n,
          status: status as "hypothesis" | "emerging" | "established",
          strength: String(Math.round(strength * 1000) / 1000),
          lastObservedAt: input.observedAt,
          updatedAt: new Date(),
        })
        .where(eq(pattern.patternId, existing.patternId));
      patternId = existing.patternId;
    }

    if (input.evidence.length > 0) {
      await tx
        .insert(patternEvidence)
        .values(
          input.evidence.map((ev) => ({
            patternId,
            eventId: ev.eventId,
            recordedAt: ev.recordedAt,
            role: ev.role,
            weight: String(ev.weight ?? 1),
          })),
        )
        .onConflictDoNothing();
    }

    return { patternId, confidence, n, status };
  });
}
