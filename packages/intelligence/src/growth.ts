/**
 * Growth Engine — deterministic metric computation for the dashboard.
 *
 * Purely functional over observed data (emotional snapshots, patterns,
 * reflections, commitments) so it is fully unit-testable and cheap to
 * recompute. No model calls.
 */
import {
  nowIso,
  type DetectedPattern,
  type EmotionalSnapshot,
  type GrowthMetrics,
} from "@synapse/shared";

export interface GrowthInputs {
  userId: string;
  snapshots: EmotionalSnapshot[];
  patterns: DetectedPattern[];
  reflectionCount: number;
  sessionCount: number;
  commitmentsMade: number;
  commitmentsCompleted: number;
}

const to100 = (n: number): number => Math.round(Math.min(Math.max(n, 0), 1) * 100);

const average = (values: number[], fallback: number): number =>
  values.length === 0
    ? fallback
    : values.reduce((sum, v) => sum + v, 0) / values.length;

const STAGE_PROGRESS: Record<DetectedPattern["stage"], number> = {
  detected: 0.1,
  understood: 0.3,
  shifting: 0.5,
  acting: 0.7,
  reflecting: 0.85,
  integrated: 1,
};

export function computeGrowthMetrics(inputs: GrowthInputs): GrowthMetrics {
  const recent = [...inputs.snapshots]
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .slice(-30);

  const clarity = average(recent.map((s) => s.clarity), 0.5);
  const stress = average(recent.map((s) => s.stress), 0.3);
  const energy = average(recent.map((s) => s.energy), 0.5);
  const valence = average(recent.map((s) => s.valence), 0);
  const motivation = average(recent.map((s) => s.motivation), 0.5);
  const confusion = average(recent.map((s) => s.confusion), 0.2);

  // Pattern work: how far along the transformation loop the user's
  // patterns are, weighted by confidence.
  const patternProgress = average(
    inputs.patterns.map(
      (p) => STAGE_PROGRESS[p.stage] * (0.5 + p.confidence / 2),
    ),
    0.3,
  );

  const commitmentRate =
    inputs.commitmentsMade === 0
      ? 0.5
      : inputs.commitmentsCompleted / inputs.commitmentsMade;

  const reflectionRate =
    inputs.sessionCount === 0
      ? 0
      : Math.min(inputs.reflectionCount / inputs.sessionCount, 1);

  const mentalPerformance = to100(clarity * 0.5 + (1 - confusion) * 0.3 + motivation * 0.2);
  const emotionalPerformance = to100(
    (valence + 1) / 2 * 0.4 + (1 - stress) * 0.35 + energy * 0.25,
  );
  const decisionQuality = to100(patternProgress * 0.5 + clarity * 0.3 + commitmentRate * 0.2);
  const reflectionScore = to100(reflectionRate);
  const learningVelocity = to100(
    Math.min(inputs.patterns.length / 10, 1) * 0.5 + patternProgress * 0.5,
  );
  const identityAlignment = to100(commitmentRate * 0.6 + patternProgress * 0.4);
  const focus = to100(clarity * 0.6 + (1 - stress) * 0.4);

  const growthScore = Math.round(
    mentalPerformance * 0.2 +
      emotionalPerformance * 0.2 +
      decisionQuality * 0.2 +
      reflectionScore * 0.1 +
      learningVelocity * 0.15 +
      identityAlignment * 0.15,
  );

  return {
    userId: inputs.userId,
    computedAt: nowIso(),
    growthScore,
    mentalPerformance,
    emotionalPerformance,
    decisionQuality,
    reflectionScore,
    learningVelocity,
    identityAlignment,
    focus,
    energy: to100(energy),
    stress: to100(stress),
  };
}
