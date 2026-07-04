import { describe, expect, it } from "vitest";
import { unwrap } from "@synapse/shared";
import { MockModel, ModelRouter } from "@synapse/ai";
import { BriefingEngine } from "../src/briefing.js";

const routerWith = (payload: unknown) =>
  new ModelRouter([
    new MockModel({
      briefing:
        typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  ]);

describe("BriefingEngine", () => {
  it("produces a validated briefing with quote and single focus", async () => {
    const engine = new BriefingEngine(
      routerWith({
        kerneindsigt:
          "Nederlaget i weekenden er ikke bearbejdet — det uforløste 'hvorfor' holder ham vågen.",
        fysisk_tilstand: "Dårlig søvn i nat, oplevet træthed.",
        mentalt_fokus: "Kognitiv dissonans mellem 'spillede godt' og 'tabte'.",
        flags: [
          {
            type: "retningsløs-stilhed",
            sikkerhed: "mellem",
            belæg: "Atleten har ikke selv en klar årsag, kun at det 'stadig fylder'.",
          },
        ],
        citat:
          "Jeg spillede godt men tabte alligevel, og jeg ved ikke helt hvorfor det stadig fylder.",
        anbefalet_fokus_for_session:
          "Luk weekendens kamp mentalt, før I går videre til nyt fokus.",
      }),
    );
    const briefing = unwrap(
      await engine.generate({
        userId: "u1",
        athleteName: "Emil",
        transcript: "Atlet: ...",
      }),
    );
    expect(briefing.athleteName).toBe("Emil");
    expect(briefing.kerneindsigt).toContain("ikke bearbejdet");
    expect(briefing.flags[0]?.type).toBe("retningsløs-stilhed");
    expect(briefing.flags[0]?.sikkerhed).toBe("mellem");
    expect(briefing.flags[0]?.belaeg).toContain("stadig fylder");
    expect(briefing.citat).toContain("spillede godt");
    expect(briefing.akut).toBe(false);
  });

  it("sorts akut flags first and sets the akut bit", async () => {
    const engine = new BriefingEngine(
      routerWith({
        kerneindsigt: "x",
        flags: [
          { type: "stagnation", sikkerhed: "lav", belæg: "a" },
          { type: "akut", sikkerhed: "høj", belæg: "nævner ikke at ville vågne op" },
        ],
        citat: "…",
        anbefalet_fokus_for_session: "…",
      }),
    );
    const briefing = unwrap(
      await engine.generate({ userId: "u1", athleteName: "A", transcript: "…" }),
    );
    expect(briefing.akut).toBe(true);
    expect(briefing.flags[0]?.type).toBe("akut");
  });

  it("drops unknown flag types and defaults invalid confidence to lav", async () => {
    const engine = new BriefingEngine(
      routerWith({
        flags: [
          { type: "opdigtet-flag", sikkerhed: "høj", belæg: "x" },
          { type: "need-shift", sikkerhed: "ekstrem", belaeg: "y" },
        ],
      }),
    );
    const briefing = unwrap(
      await engine.generate({ userId: "u1", athleteName: "A", transcript: "…" }),
    );
    expect(briefing.flags).toHaveLength(1);
    expect(briefing.flags[0]?.type).toBe("need-shift");
    expect(briefing.flags[0]?.sikkerhed).toBe("lav");
    expect(briefing.flags[0]?.belaeg).toBe("y");
  });

  it("returns a typed error on unparseable output", async () => {
    const engine = new BriefingEngine(routerWith("not json"));
    const result = await engine.generate({
      userId: "u1",
      athleteName: "A",
      transcript: "…",
    });
    expect(result.ok).toBe(false);
  });
});
