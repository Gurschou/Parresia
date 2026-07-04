/** Adapter for the Anthropic Messages API (Claude). */
import {
  err,
  ok,
  ModelUnavailableError,
  type Result,
} from "@synapse/shared";
import type {
  ChatModel,
  CompletionRequest,
  CompletionResponse,
} from "../types.js";

interface WireResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicModel implements ChatModel {
  readonly provider = "anthropic" as const;
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(options: {
    model?: string;
    apiKey: string | undefined;
    baseUrl?: string;
  }) {
    this.model = options.model ?? "claude-sonnet-4-20250514";
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(
    request: CompletionRequest,
  ): Promise<Result<CompletionResponse>> {
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = request.messages.filter((m) => m.role !== "system");
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          ...(system ? { system } : {}),
          messages,
        }),
      });
      if (!response.ok) {
        return err(
          new ModelUnavailableError(`anthropic responded ${response.status}`),
        );
      }
      const data = (await response.json()) as WireResponse;
      const content = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return ok({
        content,
        provider: this.provider,
        model: this.model,
        usage: data.usage
          ? {
              inputTokens: data.usage.input_tokens ?? 0,
              outputTokens: data.usage.output_tokens ?? 0,
            }
          : undefined,
      });
    } catch (cause) {
      return err(new ModelUnavailableError("anthropic", cause));
    }
  }
}
