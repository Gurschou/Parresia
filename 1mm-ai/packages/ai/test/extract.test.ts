import { describe, expect, it } from "vitest";
import { extractMemoryCandidates, memoryCandidateSchema } from "../src/memory/extract";
import type { AIProvider, CompleteOptions } from "../src/provider/types";
import { MockAIProvider } from "../src/provider/mock";

function providerReturning(json: string): AIProvider {
  const base = new MockAIProvider();
  return {
    ...base,
    name: "stub",
    textModel: "stub",
    realtimeModel: "stub",
    streamChat: base.streamChat.bind(base),
    embed: base.embed.bind(base),
    createRealtimeClientSecret: base.createRealtimeClientSecret.bind(base),
    complete: async (_options: CompleteOptions) => json,
  };
}

describe("memory extraction", () => {
  it("keeps valid, confident, non-sensitive candidates", async () => {
    const provider = providerReturning(
      JSON.stringify([
        {
          category: "preference",
          content: "Foretrækker korte svar",
          importance: 0.7,
          confidence: 0.9,
          sensitive: false,
        },
      ]),
    );
    const candidates = await extractMemoryCandidates(provider, "user: giv mig korte svar");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.category).toBe("preference");
  });

  it("filters sensitive and low-confidence candidates server-side", async () => {
    const provider = providerReturning(
      JSON.stringify([
        {
          category: "fact",
          content: "Har en kronisk sygdom",
          importance: 0.9,
          confidence: 0.9,
          sensitive: true,
        },
        {
          category: "fact",
          content: "Måske interesseret i løb",
          importance: 0.4,
          confidence: 0.3,
          sensitive: false,
        },
      ]),
    );
    const candidates = await extractMemoryCandidates(provider, "…");
    expect(candidates).toHaveLength(0);
  });

  it("survives malformed model output", async () => {
    for (const bad of ["not json", "{}", '"just a string"', "```json\n[]\n```"]) {
      const provider = providerReturning(bad);
      await expect(extractMemoryCandidates(provider, "…")).resolves.toEqual([]);
    }
  });

  it("schema rejects unknown categories", () => {
    expect(
      memoryCandidateSchema.safeParse({
        category: "password",
        content: "x",
        importance: 0.5,
        confidence: 0.9,
        sensitive: false,
      }).success,
    ).toBe(false);
  });
});
