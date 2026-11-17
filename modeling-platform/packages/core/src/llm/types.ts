export interface LlmRequest {
  system: string;
  userMessage: string;
  /** JSON-schema til `output_config.format`. Udeladt = fri tekst (prompt-mode). */
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
  /** Kaldes løbende med antal modtagne tegn, mens svaret streames. */
  onText?: (receivedChars: number) => void;
}

export interface LlmResponse {
  text: string;
  stopReason: string | null;
  /** Kategori ved `refusal` (fx "cyber"), ellers tom. */
  refusalCategory?: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** true hvis en server-side fallback-model besvarede anmodningen. */
  fallbackUsed: boolean;
  requestId?: string;
}

/** Fælles interface for Claude og mock — gør analyzeren testbar uden netværk. */
export interface LlmClient {
  readonly provider: "anthropic" | "mock";
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
