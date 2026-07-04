import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@synapse/shared";
import {
  cosineSimilarity,
  lexicalSimilarity,
  rankMemories,
  recencyScore,
} from "../src/recall.js";

const record = (overrides: Partial<MemoryRecord>): MemoryRecord => ({
  id: overrides.id ?? "mem_1",
  userId: "u1",
  layer: "long-term",
  kind: "fact",
  content: "content",
  importance: 0.5,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastAccessedAt: "2026-01-01T00:00:00.000Z",
  accessCount: 0,
  tags: [],
  ...overrides,
});

describe("similarity", () => {
  it("cosine of identical vectors is 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("cosine of orthogonal vectors is 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("lexical overlap scores shared tokens", () => {
    expect(
      lexicalSimilarity("stress på arbejdet", "brugeren oplever stress arbejdet"),
    ).toBeGreaterThan(0.5);
    expect(lexicalSimilarity("stress", "glæde og energi")).toBe(0);
  });
});

describe("recencyScore", () => {
  it("decays with age and respects layer half-life", () => {
    const now = new Date("2026-01-08T00:00:00.000Z");
    const shortTerm = record({ layer: "short-term" });
    const identity = record({ layer: "identity" });
    // 7 days = one short-term half-life → 0.5; identity barely decays.
    expect(recencyScore(shortTerm, now)).toBeCloseTo(0.5, 2);
    expect(recencyScore(identity, now)).toBeGreaterThan(0.98);
  });
});

describe("rankMemories", () => {
  it("prefers semantically relevant memories", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const relevant = record({
      id: "mem_relevant",
      content: "Brugeren oplever stress før vigtige præsentationer",
    });
    const irrelevant = record({
      id: "mem_irrelevant",
      content: "Brugeren kan lide kaffe om morgenen",
    });
    const ranked = rankMemories([irrelevant, relevant], {
      queryText: "stress præsentationer",
      now,
    });
    expect(ranked[0]?.record.id).toBe("mem_relevant");
  });

  it("uses importance and recency when there is no query", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const important = record({ id: "mem_important", importance: 0.9 });
    const trivial = record({ id: "mem_trivial", importance: 0.1 });
    const ranked = rankMemories([trivial, important], { now });
    expect(ranked[0]?.record.id).toBe("mem_important");
  });

  it("respects the limit", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const records = Array.from({ length: 20 }, (_, i) =>
      record({ id: `mem_${i}` }),
    );
    expect(rankMemories(records, { now, limit: 5 })).toHaveLength(5);
  });
});
