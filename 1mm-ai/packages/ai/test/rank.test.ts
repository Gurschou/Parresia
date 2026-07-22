import { describe, expect, it } from "vitest";
import { isDuplicate, rankMemories, scoreMemory } from "../src/memory/rank";

describe("memory ranking", () => {
  it("prefers higher similarity above everything else", () => {
    const high = scoreMemory({ id: "a", similarity: 0.9, importanceScore: 0.1, ageDays: 300 });
    const low = scoreMemory({ id: "b", similarity: 0.2, importanceScore: 1, ageDays: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it("uses importance and recency as tie-breakers", () => {
    const fresh = scoreMemory({ id: "a", similarity: 0.5, importanceScore: 0.5, ageDays: 0 });
    const stale = scoreMemory({ id: "b", similarity: 0.5, importanceScore: 0.5, ageDays: 365 });
    expect(fresh).toBeGreaterThan(stale);

    const important = scoreMemory({ id: "c", similarity: 0.5, importanceScore: 0.9, ageDays: 10 });
    const trivial = scoreMemory({ id: "d", similarity: 0.5, importanceScore: 0.1, ageDays: 10 });
    expect(important).toBeGreaterThan(trivial);
  });

  it("returns at most `limit` memories, best first", () => {
    const memories = [
      { id: "low", similarity: 0.1, importanceScore: 0.5, ageDays: 1 },
      { id: "high", similarity: 0.95, importanceScore: 0.5, ageDays: 1 },
      { id: "mid", similarity: 0.5, importanceScore: 0.5, ageDays: 1 },
    ];
    const ranked = rankMemories(memories, 2);
    expect(ranked.map((m) => m.id)).toEqual(["high", "mid"]);
  });

  it("clamps out-of-range scores instead of crashing", () => {
    expect(() =>
      scoreMemory({ id: "x", similarity: 5, importanceScore: -2, ageDays: 0 }),
    ).not.toThrow();
  });
});

describe("duplicate detection", () => {
  it("flags near-identical memories as duplicates", () => {
    expect(isDuplicate(0.95)).toBe(true);
    expect(isDuplicate(0.85)).toBe(true);
    expect(isDuplicate(0.7)).toBe(false);
  });
});
