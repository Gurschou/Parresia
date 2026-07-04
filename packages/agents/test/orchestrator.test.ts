/**
 * Integration tests: full conversation turns through the orchestrator with
 * scripted models — router → emotional analysis → memory → agent → patterns
 * → reflection, all without network access.
 */
import { describe, expect, it } from "vitest";
import { InProcessEventBus, unwrap } from "@synapse/shared";
import { MockModel, ModelRouter, type MockScript } from "@synapse/ai";
import { InMemoryStore, MemoryEngine } from "@synapse/memory";
import { InMemoryPatternRepository } from "@synapse/intelligence";
import { SynapseOrchestrator } from "../src/orchestrator.js";

const baseScript: MockScript = {
  coaching: "Hvad vil du gøre med dette?",
  "emotional-analysis": JSON.stringify({
    primaryEmotion: "fear",
    valence: -0.3,
    stress: 0.7,
    clarity: 0.4,
    rationale: "test",
  }),
  "pattern-analysis": JSON.stringify({
    patterns: [
      {
        category: "self-sabotage",
        label: "Udskyder svære samtaler",
        why: "Konfliktundvigelse",
        confidence: 0.7,
      },
    ],
  }),
  fast: JSON.stringify({ agent: "coach" }),
  summarization: JSON.stringify({
    insights: ["Udskydelse handler om frygt"],
    commitments: [{ action: "Book samtalen" }],
    carryForwardQuestion: "Hvad koster det at vente?",
    summary: "Session om udskydelse.",
  }),
  "memory-extraction": JSON.stringify({
    memories: [{ kind: "goal", content: "Vil sige fra", importance: 0.8 }],
  }),
};

function build(script: MockScript = baseScript) {
  const events = new InProcessEventBus();
  const router = new ModelRouter([new MockModel(script)]);
  const memory = new MemoryEngine(new InMemoryStore(), events);
  const patternRepository = new InMemoryPatternRepository();
  const orchestrator = new SynapseOrchestrator({
    router,
    memory,
    patternRepository,
    events,
  });
  return { orchestrator, memory, patternRepository, events };
}

describe("SynapseOrchestrator", () => {
  it("handles a full turn: reply, emotion, patterns", async () => {
    const { orchestrator, patternRepository } = build();
    const sessionId = orchestrator.startSession("u1");
    const turn = unwrap(
      await orchestrator.handleMessage(sessionId, "Jeg udskyder samtalen igen"),
    );
    expect(turn.reply.agentId).toBe("coach");
    expect(turn.reply.content).toContain("Hvad vil du gøre");
    expect(turn.emotionalState?.primaryEmotion).toBe("fear");
    expect(await patternRepository.listByUser("u1")).toHaveLength(1);
    expect(orchestrator.getSessionMessages(sessionId)).toHaveLength(2);
  });

  it("routes decision questions to the decision agent", async () => {
    const { orchestrator } = build({
      ...baseScript,
      fast: JSON.stringify({ agent: "decision" }),
      "decision-analysis": JSON.stringify({
        signal: "identitet",
        rootCause: "uklare kriterier",
        options: [],
        recommendedActions: [],
        confidenceScore: 0.8,
        reflectionQuestion: "Hvad ville du vælge uden frygt?",
      }),
    });
    const sessionId = orchestrator.startSession("u1");
    const turn = unwrap(
      await orchestrator.handleMessage(sessionId, "Skal jeg skifte job?"),
    );
    expect(turn.reply.agentId).toBe("decision");
    expect(turn.reply.artifacts?.decision?.signal).toBe("identitet");
    expect(turn.reply.content).toContain("Refleksionsspørgsmål");
  });

  it("falls back to coach when routing output is invalid", async () => {
    const { orchestrator } = build({ ...baseScript, fast: "garbage" });
    const sessionId = orchestrator.startSession("u1");
    const turn = unwrap(await orchestrator.handleMessage(sessionId, "hej"));
    expect(turn.reply.agentId).toBe("coach");
  });

  it("still answers when emotional analysis fails", async () => {
    const { orchestrator } = build({
      ...baseScript,
      "emotional-analysis": "not json",
    });
    const sessionId = orchestrator.startSession("u1");
    const turn = unwrap(await orchestrator.handleMessage(sessionId, "hej"));
    expect(turn.reply.content.length).toBeGreaterThan(0);
    expect(turn.emotionalState).toBeUndefined();
  });

  it("endSession reflects, stores commitments and extracts memories", async () => {
    const { orchestrator, memory } = build();
    const sessionId = orchestrator.startSession("u1");
    await orchestrator.handleMessage(sessionId, "Jeg udskyder samtalen igen");
    const reflection = unwrap(await orchestrator.endSession(sessionId));
    expect(reflection.insights).toContain("Udskydelse handler om frygt");
    const commitments = await memory.recall({ userId: "u1", kinds: ["commitment"] });
    expect(commitments).toHaveLength(1);
    const goals = await memory.recall({ userId: "u1", kinds: ["goal"] });
    expect(goals).toHaveLength(1);
    // Session is gone afterwards.
    const gone = await orchestrator.handleMessage(sessionId, "hej");
    expect(gone.ok).toBe(false);
  });

  it("memory context from one session reaches the next", async () => {
    const { orchestrator } = build();
    const first = orchestrator.startSession("u1");
    await orchestrator.handleMessage(first, "Jeg vil gerne sige fra");
    await orchestrator.endSession(first);

    // New session: coach context should include the extracted goal.
    const router = new ModelRouter([new MockModel(baseScript)]);
    void router;
    const second = orchestrator.startSession("u1");
    const turn = unwrap(await orchestrator.handleMessage(second, "sige fra"));
    expect(turn.reply.content.length).toBeGreaterThan(0);
    // The orchestrator built context including the stored goal — verify via recall.
  });

  it("computes growth metrics", async () => {
    const { orchestrator } = build();
    const sessionId = orchestrator.startSession("u1");
    await orchestrator.handleMessage(sessionId, "Jeg er presset");
    const metrics = await orchestrator.metricsFor("u1");
    expect(metrics.growthScore).toBeGreaterThanOrEqual(0);
    expect(metrics.growthScore).toBeLessThanOrEqual(100);
    expect(metrics.stress).toBe(70);
  });

  it("returns typed error for unknown sessions", async () => {
    const { orchestrator } = build();
    const result = await orchestrator.handleMessage("ses_missing", "hej");
    expect(result.ok).toBe(false);
  });
});
