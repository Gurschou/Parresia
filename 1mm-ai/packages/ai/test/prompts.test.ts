import { describe, expect, it } from "vitest";
import { LIMITS } from "@1mm/shared";
import { buildChatInput, buildSystemInstructions, CORE_SYSTEM_INSTRUCTION } from "../src/prompts";

describe("prompt building", () => {
  it("always contains the core 1MM AI instruction", () => {
    const prompt = buildSystemInstructions({
      displayName: null,
      memories: [],
      conversationSummary: null,
    });
    expect(prompt).toContain("1MM AI");
    expect(prompt).toBe(CORE_SYSTEM_INSTRUCTION);
  });

  it("injects name, memories and summary when present", () => {
    const prompt = buildSystemInstructions({
      displayName: "Mikkel",
      memories: [{ category: "preference", content: "Foretrækker korte svar" }],
      conversationSummary: "Brugeren planlægger en lancering.",
    });
    expect(prompt).toContain("Mikkel");
    expect(prompt).toContain("Foretrækker korte svar");
    expect(prompt).toContain("lancering");
  });

  it("caps memories injected into the prompt", () => {
    const memories = Array.from({ length: 50 }, (_, i) => ({
      category: "fact" as const,
      content: `memory-${i}`,
    }));
    const prompt = buildSystemInstructions({
      displayName: null,
      memories,
      conversationSummary: null,
    });
    const count = (prompt.match(/memory-\d+/g) ?? []).length;
    expect(count).toBe(LIMITS.maxMemoriesInPrompt);
  });

  it("limits history to the most recent messages and drops empties", () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: i === 99 ? "  " : `msg-${i}`,
    }));
    const input = buildChatInput(history);
    expect(input.length).toBeLessThanOrEqual(LIMITS.maxContextMessages);
    const first = input[0];
    expect(first?.kind === "message" && first.content).toBe(
      `msg-${100 - LIMITS.maxContextMessages}`,
    );
  });
});
