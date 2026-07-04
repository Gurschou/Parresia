/**
 * Decision Intelligence domain model.
 *
 * A DecisionAnalysis is the full structured output of the decision engine:
 * signal → patterns → root cause → needs → trade-offs → blind spots →
 * higher-order consequences → risk/opportunity → recommendation.
 */
export interface ConsequenceChain {
  /** Immediate, direct consequence. */
  firstOrder: string;
  /** What the first-order consequence causes. */
  secondOrder: string;
  /** Long-range systemic effect. */
  thirdOrder: string;
}

export interface DecisionOption {
  label: string;
  summary: string;
  consequences: ConsequenceChain;
  risk: string;
  opportunity: string;
  /** 0..1 alignment with the user's stated values and goals. */
  alignment: number;
}

export interface RecommendedAction {
  action: string;
  rationale: string;
  timeframe: "now" | "this-week" | "this-month" | "long-term";
}

export interface DecisionAnalysis {
  id: string;
  userId: string;
  createdAt: string;
  /** The user's decision question, verbatim. */
  question: string;
  /** What is really being asked — the underlying signal. */
  signal: string;
  /** Patterns from the user's history relevant to this decision. */
  patterns: string[];
  rootCause: string;
  humanNeeds: string[];
  tradeOffs: string[];
  blindSpots: string[];
  options: DecisionOption[];
  recommendedActions: RecommendedAction[];
  /** 0..1 — the engine's own confidence in the analysis. */
  confidenceScore: number;
  alternativePaths: string[];
  /** One powerful question that moves the user forward. */
  reflectionQuestion: string;
}
