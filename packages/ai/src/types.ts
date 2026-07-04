/**
 * Provider-agnostic model contract.
 *
 * Every foundation model (Claude, GPT, Gemini, Mistral, open source) is
 * adapted to this single interface. Everything above the Model Router only
 * ever sees `ChatModel` — swapping providers never touches engine code.
 */
import type { Result } from "@synapse/shared";

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "open-source"
  | "mock";

/** The kind of work being requested — drives routing decisions. */
export type TaskKind =
  | "creative-writing"
  | "reasoning"
  | "translation"
  | "coding"
  | "fast"
  | "coaching"
  | "emotional-analysis"
  | "pattern-analysis"
  | "decision-analysis"
  | "memory-extraction"
  | "summarization";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  task: TaskKind;
  messages: ChatMessage[];
  /** Ask the model to return strict JSON matching the prompt's schema. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  content: string;
  provider: ProviderId;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ChatModel {
  readonly provider: ProviderId;
  readonly model: string;
  /** Whether the provider can be used right now (e.g. API key configured). */
  isAvailable(): boolean;
  complete(request: CompletionRequest): Promise<Result<CompletionResponse>>;
}
