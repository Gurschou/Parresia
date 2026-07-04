import { describe, expect, it } from "vitest";
import { InProcessEventBus, unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { EmotionalEngine } from "../src/emotional.js";

const scriptedRouter = (payload: unknown) =>
  new ModelRouter([
    new MockModel({ "emotional-analysis": JSON.stringify(payload) }),
  ]);

describe("EmotionalEngine", () => {
  it("produces a validated snapshot and publishes an event", async () => {
    const bus = new InProcessEventBus();
    const events: string[] = [];
    bus.subscribe("emotion.analyzed", (p) =>
      void events.push(p.snapshot.primaryEmotion),
    );
    const engine = new EmotionalEngine(
      scriptedRouter({
        primaryEmotion: "fear",
        valence: -0.4,
        arousal: 0.7,
        stress: 0.8,
        energy: 0.4,
        motivation: 0.6,
        resistance: 0.3,
        uncertainty: 0.7,
        optimism: 0.3,
        confusion: 0.5,
        clarity: 0.3,
        rationale: "Bekymret ordvalg om fremtiden",
      }),
      bus,
    );
    const snapshot = unwrap(
      await engine.analyze({
        userId: "u1",
        sessionId: "s1",
        text: "Jeg er bange for at fejle til præsentationen",
      }),
    );
    expect(snapshot.primaryEmotion).toBe("fear");
    expect(snapshot.stress).toBe(0.8);
    expect(events).toEqual(["fear"]);
  });

  it("clamps out-of-range values and defaults invalid emotions", async () => {
    const engine = new EmotionalEngine(
      scriptedRouter({ primaryEmotion: "ecstatic", valence: 5, stress: -2 }),
    );
    const snapshot = unwrap(
      await engine.analyze({ userId: "u1", sessionId: "s1", text: "hej" }),
    );
    expect(snapshot.primaryEmotion).toBe("neutral");
    expect(snapshot.valence).toBe(1);
    expect(snapshot.stress).toBe(0);
  });

  it("returns an error for unparseable model output", async () => {
    const engine = new EmotionalEngine(
      new ModelRouter([new MockModel({ "emotional-analysis": "not json" })]),
    );
    const result = await engine.analyze({
      userId: "u1",
      sessionId: "s1",
      text: "hej",
    });
    expect(result.ok).toBe(false);
  });
});
