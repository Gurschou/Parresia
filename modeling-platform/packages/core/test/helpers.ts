import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm/types";
import { RateLimiter } from "../src/llm/rate-limiter";

export type Step = ((req: LlmRequest) => Partial<LlmResponse> | Error) | Partial<LlmResponse> | Error;

/** Scriptet fake-LLM: returnerer/kaster trin for trin og gemmer alle requests. */
export class ScriptedLlm implements LlmClient {
  readonly provider = "anthropic" as const;
  readonly model = "claude-test";
  readonly requests: LlmRequest[] = [];
  constructor(private readonly steps: Step[]) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const raw = this.steps[Math.min(this.requests.length - 1, this.steps.length - 1)]!;
    const step = typeof raw === "function" ? raw(req) : raw;
    if (step instanceof Error) throw step;
    return {
      text: "",
      stopReason: "end_turn",
      model: this.model,
      usage: { inputTokens: 100, outputTokens: 200 },
      fallbackUsed: false,
      ...step,
    };
  }
}

export const freeLimiter = () => new RateLimiter({ maxConcurrent: 10, maxRequests: 1000 });
export const noSleep = async () => {};
