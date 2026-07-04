import { describe, expect, it } from "vitest";
import { nowIso, unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { CoachEngine, COACH_SYSTEM_PROMPT } from "../src/coach.js";

describe("CoachEngine", () => {
  it("injects system prompt, memory, patterns and emotional state as context", async () => {
    const mock = new MockModel({ coaching: "Hvad vil du gøre med dette?" });
    const engine = new CoachEngine(new ModelRouter([mock]));
    const response = unwrap(
      await engine.respond({
        messages: [{ role: "user", content: "Jeg udskyder igen" }],
        memoryContext: "HUKOMMELSE: mål om at sige fra",
        activePatterns: [
          {
            id: "p1",
            userId: "u1",
            category: "self-sabotage",
            label: "Udskydelse",
            evidence: [],
            why: "Beskytter mod frygt for at fejle",
            stage: "detected",
            confidence: 0.7,
            occurrences: 3,
            firstSeenAt: nowIso(),
            lastSeenAt: nowIso(),
          },
        ],
        emotionalState: {
          id: "e1",
          userId: "u1",
          sessionId: "s1",
          capturedAt: nowIso(),
          primaryEmotion: "fear",
          valence: -0.3,
          arousal: 0.6,
          stress: 0.8,
          energy: 0.3,
          motivation: 0.5,
          resistance: 0.7,
          uncertainty: 0.6,
          optimism: 0.4,
          confusion: 0.3,
          clarity: 0.4,
          rationale: "",
        },
      }),
    );
    expect(response.content).toContain("Hvad vil du gøre");
    const request = mock.calls[0]!;
    const systemMessages = request.messages.filter((m) => m.role === "system");
    expect(systemMessages[0]?.content).toBe(COACH_SYSTEM_PROMPT);
    const context = systemMessages[1]?.content ?? "";
    expect(context).toContain("HUKOMMELSE");
    expect(context).toContain("Udskydelse");
    expect(context).toContain("forhøjet stress");
    expect(context).toContain("lav energi");
  });

  it("works without any context blocks", async () => {
    const mock = new MockModel({ coaching: "Velkommen." });
    const engine = new CoachEngine(new ModelRouter([mock]));
    unwrap(await engine.respond({ messages: [{ role: "user", content: "hej" }] }));
    const systemMessages = mock.calls[0]!.messages.filter(
      (m) => m.role === "system",
    );
    expect(systemMessages).toHaveLength(1);
  });
});
