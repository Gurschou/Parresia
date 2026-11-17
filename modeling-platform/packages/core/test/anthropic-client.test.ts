import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicLlmClient } from "../src/llm/anthropic";
import { analyzeTranscript, ANALYSIS_API_JSON_SCHEMA } from "../src/analyzer/analyze";
import { SYSTEM_PROMPT } from "../src/prompt/system-prompt";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { SAMPLE_TRANSCRIPT } from "../src/testing/sample-transcript";
import { freeLimiter, noSleep } from "./helpers";

function sse(text: string, stopReason = "end_turn") {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1234, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ];
  for (let i = 0; i < text.length; i += 500) {
    events.push(["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 500) } }]);
  }
  events.push(
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 4321 } }],
    ["message_stop", { type: "message_stop" }],
  );
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}

function fakeClient(responseText: string, captured: { url?: string; headers?: Headers; body?: any }[]) {
  return new Anthropic({
    apiKey: "sk-ant-test",
    maxRetries: 0,
    baseURL: "https://api.anthropic.test",
    fetch: (async (url: string, init: RequestInit) => {
      captured.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
      return new Response(sse(responseText), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_123" } });
    }) as unknown as typeof fetch,
  });
}

describe("AnthropicLlmClient (SDK med fake fetch)", () => {
  it("sender korrekt request: uændret system-prompt, structured output, adaptive thinking, effort og fallback", async () => {
    const captured: { url?: string; headers?: Headers; body?: any }[] = [];
    const text = JSON.stringify(generateMockAnalysis(SAMPLE_TRANSCRIPT));
    const llm = new AnthropicLlmClient({
      model: "claude-opus-5-5",
      effort: "high",
      adaptiveThinking: true,
      fallbacks: true,
      timeoutMs: 10_000,
      client: fakeClient(text, captured),
    });
    let progressed = 0;
    const env = await analyzeTranscript(
      { transcript: SAMPLE_TRANSCRIPT },
      { llm, limiter: freeLimiter(), sleep: noSleep, onProgress: (p) => p.stage === "receiving" && progressed++ },
    );

    const req = captured[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.body.system).toBe(SYSTEM_PROMPT);
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.stream).toBe(true);
    expect(req.body.thinking).toEqual({ type: "adaptive" });
    expect(req.body.output_config.effort).toBe("high");
    expect(req.body.output_config.format).toEqual({ type: "json_schema", schema: ANALYSIS_API_JSON_SCHEMA });
    expect(req.body.fallbacks).toBe("default");
    expect(req.headers!.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.body.messages).toHaveLength(1);
    expect(req.body.messages[0].role).toBe("user");

    expect(env.meta.input_tokens).toBe(1234);
    expect(env.meta.output_tokens).toBe(4321);
    expect(env.meta.model).toBe("claude-opus-5-5");
    expect(progressed).toBeGreaterThan(1);
  });

  it("udelader fallback/thinking/effort når de er slået fra", async () => {
    const captured: { headers?: Headers; body?: any }[] = [];
    const llm = new AnthropicLlmClient({
      model: "claude-sonnet-5-5",
      adaptiveThinking: false,
      fallbacks: false,
      timeoutMs: 10_000,
      client: fakeClient("{}", captured),
    });
    const res = await llm.complete({ system: SYSTEM_PROMPT, userMessage: "hej", maxTokens: 100 });
    expect(res.text).toBe("{}");
    expect(captured[0]!.body.thinking).toBeUndefined();
    expect(captured[0]!.body.output_config).toBeUndefined();
    expect(captured[0]!.body.fallbacks).toBeUndefined();
    expect(captured[0]!.headers!.get("anthropic-beta")).toBeNull();
  });
});
