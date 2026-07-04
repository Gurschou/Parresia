/**
 * Adapter for OpenAI-compatible chat completion APIs.
 * OpenAI and Mistral (and most open-source servers like vLLM/Ollama)
 * share this wire format, so one adapter covers them all.
 */
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
  ProviderId,
} from "../types.js";

export interface OpenAiCompatibleConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string | undefined;
}

interface WireResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAiCompatibleModel implements ChatModel {
  readonly provider: ProviderId;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: OpenAiCompatibleConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(
    request: CompletionRequest,
  ): Promise<Result<CompletionResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2048,
          ...(request.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!response.ok) {
        return err(
          new ModelUnavailableError(
            `${this.provider} responded ${response.status}`,
          ),
        );
      }
      const data = (await response.json()) as WireResponse;
      const content = data.choices?.[0]?.message?.content ?? "";
      return ok({
        content,
        provider: this.provider,
        model: this.model,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens ?? 0,
              outputTokens: data.usage.completion_tokens ?? 0,
            }
          : undefined,
      });
    } catch (cause) {
      return err(new ModelUnavailableError(this.provider, cause));
    }
  }
}
