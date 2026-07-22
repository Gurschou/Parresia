import { describe, expect, it } from "vitest";
import { clamp, cosineSimilarity, truncate } from "../src/utils";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("throws for mismatched lengths", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});

describe("clamp", () => {
  it("clamps into the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe("truncate", () => {
  it("keeps short strings and cuts long ones", () => {
    expect(truncate("hej", 10)).toBe("hej");
    expect(truncate("a".repeat(20), 10).length).toBeLessThanOrEqual(10);
  });
});
