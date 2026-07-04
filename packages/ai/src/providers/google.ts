/** Adapter for the Google Gemini generateContent API. */
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
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GoogleModel implements ChatModel {
  readonly provider = "google" as const;
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(options: {
    model?: string;
    apiKey: string | undefined;
    baseUrl?: string;
  }) {
    this.model = options.model ?? "gemini-2.0-flash";
    this.apiKey = options.apiKey;
    this.baseUrl = (
      options.baseUrl ?? "https://generativelanguage.googleapis.com"
    ).replace(/\/$/, "");
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(
    request: CompletionRequest,
  ): Promise<Result<CompletionResponse>> {
    const systemText = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    try {
      const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(systemText
            ? { systemInstruction: { parts: [{ text: systemText }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 2048,
            ...(request.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return err(
          new ModelUnavailableError(
            `google responded ${response.status}: ${body.slice(0, 300)}`,
          ),
        );
      }
      const data = (await response.json()) as WireResponse;
      const content = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");
      return ok({
        content,
        provider: this.provider,
        model: this.model,
        usage: data.usageMetadata
          ? {
              inputTokens: data.usageMetadata.promptTokenCount ?? 0,
              outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            }
          : undefined,
      });
    } catch (cause) {
      return err(new ModelUnavailableError("google", cause));
    }
  }
}
