/**
 * Growth metrics domain model — what the dashboard renders.
 * All scores are 0..100 for direct presentation.
 */
export interface GrowthMetrics {
  userId: string;
  computedAt: string;
  growthScore: number;
  mentalPerformance: number;
  emotionalPerformance: number;
  decisionQuality: number;
  reflectionScore: number;
  learningVelocity: number;
  identityAlignment: number;
  focus: number;
  energy: number;
  stress: number;
}

export interface MetricPoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  metric: keyof Omit<GrowthMetrics, "userId" | "computedAt">;
  points: MetricPoint[];
}
