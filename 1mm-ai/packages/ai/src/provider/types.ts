/**
 * Provider abstraction: everything the app needs from an AI vendor.
 * Swapping OpenAI for another provider (or the deterministic mock) only
 * requires implementing this interface.
 */

export type ModelMessage =
  | { kind: "message"; role: "user" | "assistant" | "system"; content: string }
  | { kind: "function_call"; callId: string; name: string; arguments: string }
  | { kind: "function_call_output"; callId: string; output: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

export type ProviderStreamPart =
  | { type: "delta"; text: string }
  | { type: "tool_call"; callId: string; name: string; arguments: string }
  | {
      type: "completed";
      fullText: string;
      usage: { inputTokens: number; outputTokens: number } | null;
    };

export interface StreamChatOptions {
  instructions: string;
  input: ModelMessage[];
  tools?: ToolDefinition[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface CompleteOptions {
  instructions: string;
  prompt: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface RealtimeClientSecret {
  /** The short-lived token value (ek_…). Safe to hand to the client. */
  value: string;
  /** Unix epoch seconds when the secret expires. */
  expiresAt: number;
  model: string;
}

export interface CreateRealtimeSecretOptions {
  instructions: string;
  /** Opaque per-user identifier forwarded as OpenAI-Safety-Identifier. */
  safetyIdentifier: string;
  /** Enable transcription of the user's audio input. */
  transcribeInput?: boolean;
}

export interface AIProvider {
  readonly name: string;
  readonly textModel: string;
  readonly realtimeModel: string;

  /** Stream a chat turn (Responses API on OpenAI). */
  streamChat(options: StreamChatOptions): AsyncIterable<ProviderStreamPart>;

  /** One-shot completion for titles, summaries and memory extraction. */
  complete(options: CompleteOptions): Promise<string>;

  /** Batch-embed texts for pgvector similarity search. */
  embed(texts: string[]): Promise<number[][]>;

  /** Mint a short-lived Realtime client secret (never the real API key). */
  createRealtimeClientSecret(options: CreateRealtimeSecretOptions): Promise<RealtimeClientSecret>;
}
