/**
 * Pattern Intelligence domain model.
 *
 * The core transformation loop of SYNAPSE:
 * Pattern Detection → Understanding → Shift → Aligned Action → Reflection → Growth.
 * A DetectedPattern always carries a `why` (understanding) — detection
 * without explanation does not create transformation.
 */
export type PatternCategory =
  | "emotional"
  | "decision"
  | "habit"
  | "cognitive-distortion"
  | "bias"
  | "self-sabotage"
  | "stress"
  | "motivation"
  | "learning-style"
  | "communication-style"
  | "leadership-style"
  | "decision-style"
  | "energy"
  | "relational"
  | "value-conflict"
  | "goal-conflict"
  | "life-direction"
  | "repeated-mistake"
  | "hidden-opportunity";

export type PatternStage =
  | "detected"
  | "understood"
  | "shifting"
  | "acting"
  | "reflecting"
  | "integrated";

export interface DetectedPattern {
  id: string;
  userId: string;
  category: PatternCategory;
  /** Short human-readable name, e.g. "Udskyder svære samtaler". */
  label: string;
  /** What was observed — concrete evidence from conversations. */
  evidence: string[];
  /** Why the pattern exists — the understanding step. */
  why: string;
  /** Suggested shift — the reframe or alternative behaviour. */
  suggestedShift?: string;
  stage: PatternStage;
  /** 0..1 — how confident the system is that this pattern is real. */
  confidence: number;
  /** How many independent observations support the pattern. */
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
}
