import { describe, expect, it } from "vitest";
import { unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { InMemoryPatternRepository, PatternEngine } from "../src/pattern.js";

const routerWith = (patterns: unknown[]) =>
  new ModelRouter([
    new MockModel({ "pattern-analysis": JSON.stringify({ patterns }) }),
  ]);

describe("PatternEngine", () => {
  it("detects a new pattern with a why", async () => {
    const engine = new PatternEngine(
      routerWith([
        {
          category: "self-sabotage",
          label: "Udskyder svære samtaler",
          evidence: ["'jeg tager den i næste uge' — tredje gang"],
          why: "Konfliktundvigelse beskytter mod frygten for afvisning",
          suggestedShift: "Book samtalen inden for 24 timer, mens beslutningen er varm",
          confidence: 0.7,
        },
      ]),
      new InMemoryPatternRepository(),
    );
    const patterns = unwrap(
      await engine.detect({ userId: "u1", transcript: "..." }),
    );
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.why).toContain("Konfliktundvigelse");
    expect(patterns[0]?.stage).toBe("detected");
    expect(patterns[0]?.occurrences).toBe(1);
  });

  it("reinforces a known pattern instead of duplicating it", async () => {
    const repo = new InMemoryPatternRepository();
    const engine = new PatternEngine(
      routerWith([
        {
          category: "self-sabotage",
          label: "Udskyder svære samtaler",
          why: "Konfliktundvigelse",
          confidence: 0.6,
        },
      ]),
      repo,
    );
    await engine.detect({ userId: "u1", transcript: "session 1" });
    await engine.detect({ userId: "u1", transcript: "session 2" });
    const all = await repo.listByUser("u1");
    expect(all).toHaveLength(1);
    expect(all[0]?.occurrences).toBe(2);
    expect(all[0]?.confidence).toBeGreaterThan(0.6);
  });

  it("skips model output without label or why", async () => {
    const engine = new PatternEngine(
      routerWith([{ category: "bias", label: "", why: "" }]),
      new InMemoryPatternRepository(),
    );
    const patterns = unwrap(
      await engine.detect({ userId: "u1", transcript: "..." }),
    );
    expect(patterns).toHaveLength(0);
  });
});
