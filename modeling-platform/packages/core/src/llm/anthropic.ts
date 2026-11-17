import Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "../config";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";

export interface AnthropicClientOptions {
  apiKey?: string;
  model: string;
  effort?: Effort;
  adaptiveThinking: boolean;
  /** Server-side fallback ved policy-afvisning (`fallbacks: "default"`). */
  fallbacks: boolean;
  timeoutMs: number;
  /** Injicér en færdig SDK-klient (tests). */
  client?: Anthropic;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Claude-klient. Streamer altid (lange transskripter / lange JSON-svar),
 * bruger structured outputs via `output_config.format` og adaptive thinking.
 * SDK'ens egne retries er slået fra — retries + rate-limiting håndteres ét
 * sted i analyzeren, så de også dækker fejl midt i en stream.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly provider = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicClientOptions) {
    this.model = opts.model;
    this.client =
      opts.client ??
      new Anthropic({
        apiKey: opts.apiKey,
        maxRetries: 0,
        timeout: opts.timeoutMs,
      });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const outputConfig: Anthropic.Beta.BetaOutputConfig = {};
    if (this.opts.effort) outputConfig.effort = this.opts.effort;
    if (req.jsonSchema) outputConfig.format = { type: "json_schema", schema: req.jsonSchema };

    const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
      model: this.opts.model,
      max_tokens: req.maxTokens,
      // System-prompten sendes præcis som modtaget — aldrig udvidet her.
      system: req.system,
      messages: [{ role: "user", content: req.userMessage }],
      stream: true,
      ...(this.opts.adaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      ...(this.opts.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    const stream = this.client.beta.messages.stream(params, { signal: req.signal });
    let received = 0;
    stream.on("text", (delta) => {
      received += delta.length;
      req.onText?.(received);
    });
    const msg = await stream.finalMessage();

    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const iterations = (msg.usage as { iterations?: { type: string }[] | null }).iterations ?? [];
    const stopDetails = (msg as { stop_details?: { category?: string | null } | null }).stop_details;

    return {
      text,
      stopReason: msg.stop_reason,
      refusalCategory: msg.stop_reason === "refusal" ? (stopDetails?.category ?? undefined) : undefined,
      model: msg.model,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      fallbackUsed: iterations.some((i) => i.type === "fallback_message"),
      requestId: (msg as { _request_id?: string | null })._request_id ?? undefined,
    };
  }
}
