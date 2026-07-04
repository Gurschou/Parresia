import { describe, expect, it } from "vitest";
import { unwrap } from "@synapse/shared";
import { MockModel, ModelRouter, type MockScript } from "@synapse/ai";
import {
  InMemoryBriefingRepository,
  SynapseXPipeline,
} from "../src/synapsex.js";

const script: MockScript = {
  intake:
    "Du siger 'jeg ved ikke helt hvorfor' — men det gør du. Hvad tænkte du om dig selv i det øjeblik, I tabte?",
  briefing: JSON.stringify({
    kerneindsigt: "Nederlaget er ikke bearbejdet.",
    fysisk_tilstand: "Dårlig søvn.",
    mentalt_fokus: "Uforløst kamp.",
    flags: [
      { type: "retningsløs-stilhed", sikkerhed: "mellem", belæg: "ingen klar årsag" },
    ],
    citat: "Jeg spillede godt men tabte alligevel.",
    anbefalet_fokus_for_session: "Luk weekendens kamp mentalt først.",
  }),
};

function build() {
  const repository = new InMemoryBriefingRepository();
  const pipeline = new SynapseXPipeline(
    new ModelRouter([new MockModel(script)]),
    repository,
  );
  return { pipeline, repository };
}

describe("SynapseXPipeline", () => {
  it("opens the intake itself with transparency about the briefing", () => {
    const { pipeline } = build();
    const { sessionId, opening } = pipeline.startIntake({
      userId: "athlete1",
      athleteName: "Emil",
      coachName: "Thomas",
    });
    expect(pipeline.hasSession(sessionId)).toBe(true);
    expect(opening).toContain("Thomas");
    expect(opening).toContain("briefing");
  });

  it("runs a full intake → briefing pipeline and persists the briefing", async () => {
    const { pipeline, repository } = build();
    const { sessionId } = pipeline.startIntake({
      userId: "athlete1",
      athleteName: "Emil",
    });
    const reply = unwrap(
      await pipeline.handleMessage(sessionId, "Sov dårligt — kampen fylder stadig."),
    );
    expect(reply.content).toContain("Hvad tænkte du om dig selv");

    const briefing = unwrap(await pipeline.endIntake(sessionId));
    expect(briefing.athleteName).toBe("Emil");
    expect(briefing.anbefaletFokus).toContain("Luk weekendens kamp");
    expect(briefing.akut).toBe(false);

    const stored = await repository.listByUser("athlete1");
    expect(stored).toHaveLength(1);
    // Session is closed afterwards.
    expect(pipeline.hasSession(sessionId)).toBe(false);
  });

  it("refuses to brief an intake without athlete messages", async () => {
    const { pipeline } = build();
    const { sessionId } = pipeline.startIntake({ userId: "athlete1" });
    const result = await pipeline.endIntake(sessionId);
    expect(result.ok).toBe(false);
  });

  it("returns typed errors for unknown sessions", async () => {
    const { pipeline } = build();
    expect((await pipeline.handleMessage("sxi_missing", "hej")).ok).toBe(false);
    expect((await pipeline.endIntake("sxi_missing")).ok).toBe(false);
  });

  it("feeds previous core insights into the next briefing", async () => {
    const repository = new InMemoryBriefingRepository();
    const mock = new MockModel(script);
    const pipeline = new SynapseXPipeline(new ModelRouter([mock]), repository);

    const first = pipeline.startIntake({ userId: "athlete1" });
    await pipeline.handleMessage(first.sessionId, "Kampen fylder.");
    await pipeline.endIntake(first.sessionId);

    const second = pipeline.startIntake({ userId: "athlete1" });
    await pipeline.handleMessage(second.sessionId, "Sover stadig dårligt.");
    await pipeline.endIntake(second.sessionId);

    const briefingCalls = mock.calls.filter((c) => c.task === "briefing");
    expect(briefingCalls).toHaveLength(2);
    const secondSystem = briefingCalls[1]?.messages.find(
      (m) => m.role === "system",
    );
    expect(secondSystem?.content).toContain("TIDLIGERE BRIEFINGER");
    expect(secondSystem?.content).toContain("Nederlaget er ikke bearbejdet.");
  });
});
