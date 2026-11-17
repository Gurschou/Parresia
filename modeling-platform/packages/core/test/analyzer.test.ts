import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { analyzeTranscript } from "../src/analyzer/analyze";
import { AnalysisError, toAnalysisError } from "../src/analyzer/errors";
import { SYSTEM_PROMPT } from "../src/prompt/system-prompt";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { SAMPLE_TRANSCRIPT } from "../src/testing/sample-transcript";
import { MockLlmClient } from "../src/llm/mock";
import { ScriptedLlm, freeLimiter, noSleep } from "./helpers";

const validJson = () => JSON.stringify(generateMockAnalysis(SAMPLE_TRANSCRIPT));
const base = { limiter: freeLimiter(), sleep: noSleep, config: { maxRetries: 3 } };

describe("analyzeTranscript", () => {
  it("returnerer en valideret analyse med metadata (mock-provider)", async () => {
    const stages: string[] = [];
    const env = await analyzeTranscript(
      { transcript: SAMPLE_TRANSCRIPT, context: { subjectName: "Mette Holm" } },
      { ...base, llm: new MockLlmClient(), onProgress: (p) => stages.push(p.stage) },
    );
    expect(env.schema_version).toBe(1);
    expect(env.result.summary.subject).toBe("Mette Holm");
    expect(env.meta.provider).toBe("mock");
    expect(env.meta.lexicon.total).toBeGreaterThan(0);
    expect(env.result.eye_accessing_cues.basis).toBe("observed_annotations");
    expect(stages).toContain("analyzing");
    expect(stages.at(-1)).toBe("done");
  });

  it("sender system-prompten uændret og JSON-schema i schema-mode", async () => {
    const llm = new ScriptedLlm([{ text: validJson() }]);
    await analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm });
    expect(llm.requests[0]!.system).toBe(SYSTEM_PROMPT);
    expect(llm.requests[0]!.jsonSchema).toBeDefined();
    expect(llm.requests[0]!.userMessage).toContain("<transskript>");
  });

  it("kører én reparationsrunde ved valideringsfejl", async () => {
    const broken = JSON.parse(validJson());
    delete broken.meta_programs;
    const llm = new ScriptedLlm([{ text: JSON.stringify(broken) }, { text: validJson() }]);
    const env = await analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm });
    expect(env.meta.repaired).toBe(true);
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[1]!.userMessage).toContain("<rettelse>");
    expect(llm.requests[1]!.userMessage).toContain("meta_programs");
  });

  it("giver invalid_output efter mislykket reparation", async () => {
    const llm = new ScriptedLlm([{ text: "ikke json" }, { text: "{}" }]);
    await expect(analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm })).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("retter enum-casing og clamper tal deterministisk (uden reparationsrunde)", async () => {
    const d = JSON.parse(validJson());
    d.vakog.primary_system = "k";
    d.values_and_6_human_needs.human_needs.growth.score = 12;
    d.meta_programs.programs[0].leaning = "POLE_A";
    const llm = new ScriptedLlm([{ text: "```json\n" + JSON.stringify(d) + "\n```" }]);
    const env = await analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm });
    expect(llm.requests).toHaveLength(1);
    expect(env.result.vakog.primary_system).toBe("K");
    expect(env.result.values_and_6_human_needs.human_needs.growth.score).toBe(10);
    expect(env.meta.fixes.length).toBeGreaterThanOrEqual(3);
  });

  it("håndterer refusal og max_tokens som typed fejl", async () => {
    await expect(
      analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm: new ScriptedLlm([{ stopReason: "refusal", refusalCategory: "cyber" }]) }),
    ).rejects.toMatchObject({ code: "refusal" });
    await expect(
      analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm: new ScriptedLlm([{ stopReason: "max_tokens", text: "{" }]) }),
    ).rejects.toMatchObject({ code: "truncated" });
  });

  it("forsøger igen ved overbelastning og rate limit, men ikke ved auth-fejl", async () => {
    const retries: number[] = [];
    const llm = new ScriptedLlm([
      new AnalysisError("overloaded"),
      new AnalysisError("rate_limited", { retryAfterMs: 1500 }),
      { text: validJson() },
    ]);
    const env = await analyzeTranscript(
      { transcript: SAMPLE_TRANSCRIPT },
      { ...base, llm, sleep: async (ms) => void retries.push(ms) },
    );
    expect(env.meta.attempts).toBe(3);
    expect(retries[1]).toBe(1500); // retry-after respekteres

    const auth = new ScriptedLlm([new AnalysisError("auth"), { text: validJson() }]);
    await expect(analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm: auth })).rejects.toMatchObject({ code: "auth" });
    expect(auth.requests).toHaveLength(1);
  });

  it("giver op efter maxRetries", async () => {
    const llm = new ScriptedLlm([new AnalysisError("overloaded")]);
    await expect(
      analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm, config: { maxRetries: 2 } }),
    ).rejects.toMatchObject({ code: "overloaded" });
    expect(llm.requests).toHaveLength(3);
  });

  it("falder tilbage til prompt-mode hvis schemaet er for komplekst", async () => {
    const tooComplex = Anthropic.APIError.generate(400, { error: { type: "invalid_request_error", message: "Schema is too complex for compilation" } }, "Schema is too complex for compilation", new Headers());
    const llm = new ScriptedLlm([tooComplex, { text: validJson() }]);
    const env = await analyzeTranscript({ transcript: SAMPLE_TRANSCRIPT }, { ...base, llm });
    expect(env.meta.structured_mode).toBe("prompt");
    expect(llm.requests[1]!.jsonSchema).toBeUndefined();
    expect(llm.requests[1]!.userMessage).toContain("<json_schema>");
  });

  it("validerer inputlængde", async () => {
    const llm = new ScriptedLlm([{ text: validJson() }]);
    await expect(analyzeTranscript({ transcript: "  kort " }, { ...base, llm })).rejects.toMatchObject({ code: "input_empty" });
    await expect(
      analyzeTranscript({ transcript: "a".repeat(500) }, { ...base, llm, config: { maxTranscriptChars: 100 } }),
    ).rejects.toMatchObject({ code: "input_too_long" });
    expect(llm.requests).toHaveLength(0);
  });

  it("kan afbrydes med AbortSignal", async () => {
    const ctrl = new AbortController();
    const p = analyzeTranscript(
      { transcript: SAMPLE_TRANSCRIPT },
      { ...base, llm: new MockLlmClient({ delayMs: 2000 }), signal: ctrl.signal },
    );
    setTimeout(() => ctrl.abort(), 50);
    await expect(p).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("toAnalysisError", () => {
  const h = new Headers({ "retry-after": "7" });
  it.each([
    [401, "auth"],
    [403, "permission"],
    [404, "model_not_found"],
    [429, "rate_limited"],
    [413, "input_too_long"],
    [500, "server"],
    [529, "overloaded"],
  ])("HTTP %i → %s", (status, code) => {
    const e = toAnalysisError(Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", h));
    expect(e.code).toBe(code);
    expect(e.userMessage.length).toBeGreaterThan(10);
  });

  it("læser retry-after og markerer retryable korrekt", () => {
    const e = toAnalysisError(Anthropic.APIError.generate(429, {}, "rate", h));
    expect(e.retryAfterMs).toBe(7000);
    expect(e.retryable).toBe(true);
    expect(toAnalysisError(Anthropic.APIError.generate(401, {}, "no", h)).retryable).toBe(false);
  });

  it("mapper netværks- og abort-fejl", () => {
    expect(toAnalysisError(new Anthropic.APIConnectionError({ message: "down" })).code).toBe("network");
    expect(toAnalysisError(new Anthropic.APIConnectionTimeoutError()).code).toBe("timeout");
    expect(toAnalysisError(new Anthropic.APIUserAbortError()).code).toBe("aborted");
    expect(toAnalysisError(new Error("boom")).code).toBe("unknown");
  });
});
