/**
 * Deterministic mock provider.
 *
 * Serves three purposes:
 *  1. Unit/integration tests without network calls.
 *  2. Local development without API keys.
 *  3. Last-resort fallback so the product degrades gracefully instead of
 *     erroring when no provider is configured.
 *
 * Responses can be scripted per task; unscripted JSON tasks return valid
 * empty-ish JSON so downstream parsers keep working.
 */
import { ok, type Result } from "@synapse/shared";
import type {
  ChatModel,
  CompletionRequest,
  CompletionResponse,
  TaskKind,
} from "../types.js";

export type MockScript = Partial<
  Record<TaskKind, string | ((request: CompletionRequest) => string)>
>;

export class MockModel implements ChatModel {
  readonly provider = "mock" as const;
  readonly model = "synapse-mock";
  readonly calls: CompletionRequest[] = [];
  private readonly script: MockScript;

  constructor(script: MockScript = {}) {
    this.script = script;
  }

  isAvailable(): boolean {
    return true;
  }

  async complete(
    request: CompletionRequest,
  ): Promise<Result<CompletionResponse>> {
    this.calls.push(request);
    const scripted = this.script[request.task];
    const content =
      typeof scripted === "function"
        ? scripted(request)
        : (scripted ?? this.defaultContent(request));
    return ok({ content, provider: this.provider, model: this.model });
  }

  private defaultContent(request: CompletionRequest): string {
    if (request.json) return "{}";
    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === "user");
    return `SYNAPSE kører i offline-tilstand (ingen model-nøgler konfigureret). Jeg hørte: "${lastUser?.content ?? ""}". Tilføj en API-nøgle for fulde svar.`;
  }
}
