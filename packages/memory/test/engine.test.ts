import { describe, expect, it } from "vitest";
import { InProcessEventBus, unwrap, type Message } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { MemoryEngine } from "../src/engine.js";
import { InMemoryStore } from "../src/store.js";

describe("MemoryEngine", () => {
  it("remembers and recalls with reinforcement", async () => {
    const engine = new MemoryEngine(new InMemoryStore());
    await engine.remember({
      userId: "u1",
      layer: "identity",
      kind: "goal",
      content: "Vil holde oplæg uden nervøsitet",
      importance: 0.8,
    });
    const results = await engine.recall({ userId: "u1", text: "oplæg" });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.accessCount).toBe(1);
  });

  it("publishes memory.stored events", async () => {
    const bus = new InProcessEventBus();
    const engine = new MemoryEngine(new InMemoryStore(), bus);
    const seen: string[] = [];
    bus.subscribe("memory.stored", (p) => {
      seen.push(p.record.content);
    });
    await engine.remember({
      userId: "u1",
      layer: "long-term",
      kind: "fact",
      content: "Arbejder som leder",
    });
    expect(seen).toEqual(["Arbejder som leder"]);
  });

  it("builds quiet prompt context from identity and relevant memories", async () => {
    const engine = new MemoryEngine(new InMemoryStore());
    await engine.remember({
      userId: "u1",
      layer: "identity",
      kind: "value",
      content: "Frihed og ærlighed",
    });
    const context = await engine.buildContext("u1", "frihed");
    expect(context).toContain("HUKOMMELSE OM BRUGEREN");
    expect(context).toContain("Frihed og ærlighed");
  });

  it("returns first-session marker for unknown users", async () => {
    const engine = new MemoryEngine(new InMemoryStore());
    const context = await engine.buildContext("unknown");
    expect(context).toContain("første session");
  });

  it("extracts durable memories from a conversation", async () => {
    const router = new ModelRouter([
      new MockModel({
        "memory-extraction": JSON.stringify({
          memories: [
            {
              kind: "goal",
              content: "Vil sige fra på arbejdet",
              importance: 0.9,
              tags: ["arbejde"],
            },
            { kind: "conversation", content: "skal filtreres fra" },
          ],
        }),
      }),
    ]);
    const engine = new MemoryEngine(new InMemoryStore());
    const messages: Message[] = [
      {
        id: "m1",
        sessionId: "s1",
        role: "user",
        content: "Jeg vil gerne blive bedre til at sige fra",
        createdAt: new Date().toISOString(),
      },
    ];
    const stored = unwrap(
      await engine.extractFromConversation("u1", messages, router),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe("goal");
    expect(stored[0]?.layer).toBe("identity");
  });
});
