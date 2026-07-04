import { describe, expect, it } from "vitest";
import { nowIso, type DetectedPattern, type EmotionalSnapshot } from "@synapse/shared";
import { computeGrowthMetrics } from "../src/growth.js";

const snapshot = (overrides: Partial<EmotionalSnapshot>): EmotionalSnapshot => ({
  id: "e1",
  userId: "u1",
  sessionId: "s1",
  capturedAt: nowIso(),
  primaryEmotion: "neutral",
  valence: 0,
  arousal: 0.5,
  stress: 0.3,
  energy: 0.5,
  motivation: 0.5,
  resistance: 0.2,
  uncertainty: 0.3,
  optimism: 0.5,
  confusion: 0.2,
  clarity: 0.5,
  rationale: "",
  ...overrides,
});

const pattern = (stage: DetectedPattern["stage"]): DetectedPattern => ({
  id: "p1",
  userId: "u1",
  category: "habit",
  label: "x",
  evidence: [],
  why: "y",
  stage,
  confidence: 0.8,
  occurrences: 3,
  firstSeenAt: nowIso(),
  lastSeenAt: nowIso(),
});

describe("computeGrowthMetrics", () => {
  it("returns all scores in 0..100", () => {
    const metrics = computeGrowthMetrics({
      userId: "u1",
      snapshots: [snapshot({})],
      patterns: [pattern("detected")],
      reflectionCount: 1,
      sessionCount: 2,
      commitmentsMade: 2,
      commitmentsCompleted: 1,
    });
    for (const [key, value] of Object.entries(metrics)) {
      if (key === "userId" || key === "computedAt") continue;
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(value, key).toBeLessThanOrEqual(100);
    }
  });

  it("high clarity and low stress increase performance scores", () => {
    const calm = computeGrowthMetrics({
      userId: "u1",
      snapshots: [snapshot({ clarity: 0.9, stress: 0.1, valence: 0.6, energy: 0.8 })],
      patterns: [],
      reflectionCount: 0,
      sessionCount: 0,
      commitmentsMade: 0,
      commitmentsCompleted: 0,
    });
    const stressed = computeGrowthMetrics({
      userId: "u1",
      snapshots: [snapshot({ clarity: 0.2, stress: 0.9, valence: -0.5, energy: 0.2, confusion: 0.8 })],
      patterns: [],
      reflectionCount: 0,
      sessionCount: 0,
      commitmentsMade: 0,
      commitmentsCompleted: 0,
    });
    expect(calm.mentalPerformance).toBeGreaterThan(stressed.mentalPerformance);
    expect(calm.emotionalPerformance).toBeGreaterThan(stressed.emotionalPerformance);
    expect(calm.focus).toBeGreaterThan(stressed.focus);
  });

  it("integrated patterns raise decision quality vs. merely detected", () => {
    const base = {
      userId: "u1",
      snapshots: [snapshot({})],
      reflectionCount: 1,
      sessionCount: 1,
      commitmentsMade: 1,
      commitmentsCompleted: 1,
    };
    const detected = computeGrowthMetrics({ ...base, patterns: [pattern("detected")] });
    const integrated = computeGrowthMetrics({ ...base, patterns: [pattern("integrated")] });
    expect(integrated.decisionQuality).toBeGreaterThan(detected.decisionQuality);
    expect(integrated.growthScore).toBeGreaterThan(detected.growthScore);
  });

  it("handles a brand-new user with no data", () => {
    const metrics = computeGrowthMetrics({
      userId: "u1",
      snapshots: [],
      patterns: [],
      reflectionCount: 0,
      sessionCount: 0,
      commitmentsMade: 0,
      commitmentsCompleted: 0,
    });
    expect(metrics.growthScore).toBeGreaterThanOrEqual(0);
    expect(metrics.reflectionScore).toBe(0);
  });
});
