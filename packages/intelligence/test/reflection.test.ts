import { describe, expect, it } from "vitest";
import { InProcessEventBus, unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { ReflectionEngine } from "../src/reflection.js";

describe("ReflectionEngine", () => {
  it("distills insights and commitments, publishing events", async () => {
    const bus = new InProcessEventBus();
    const commitments: string[] = [];
    const reflections: string[][] = [];
    bus.subscribe("coach.commitment", (p) => void commitments.push(p.action));
    bus.subscribe("reflection.completed", (p) => void reflections.push(p.insights));
    const engine = new ReflectionEngine(
      new ModelRouter([
        new MockModel({
          summarization: JSON.stringify({
            insights: ["Udskydelse handler om frygt, ikke tid"],
            commitments: [{ action: "Book samtalen med chefen", due: "2026-07-06" }],
            carryForwardQuestion: "Hvad koster det dig at vente?",
            summary: "Session om udskydelse af en svær samtale.",
          }),
        }),
      ]),
      bus,
    );
    const reflection = unwrap(
      await engine.reflect({
        userId: "u1",
        sessionId: "s1",
        messages: [{ role: "user", content: "..." }],
      }),
    );
    expect(reflection.insights).toHaveLength(1);
    expect(reflection.commitments[0]?.due).toBe("2026-07-06");
    expect(commitments).toEqual(["Book samtalen med chefen"]);
    expect(reflections).toHaveLength(1);
  });
});
