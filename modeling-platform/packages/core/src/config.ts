/**
 * Central konfiguration fra miljøvariabler. Alle værdier har fornuftige
 * defaults; se `.env.example` for dokumentation.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type LlmProviderName = "anthropic" | "mock";
export type StructuredMode = "schema" | "prompt";

export interface CoreConfig {
  llmProvider: LlmProviderName;
  anthropicApiKey: string | undefined;
  model: string;
  effort: Effort | undefined;
  adaptiveThinking: boolean;
  fallbacks: boolean;
  maxTokens: number;
  structuredMode: StructuredMode;
  maxConcurrency: number;
  requestsPerMinute: number;
  maxRetries: number;
  requestTimeoutMs: number;
  maxTranscriptChars: number;
  minTranscriptChars: number;
  mockDelayMs: number;
}

const int = (v: string | undefined, d: number) => {
  const n = v === undefined || v === "" ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function loadConfig(env: Record<string, string | undefined> = process.env): CoreConfig {
  const provider = (env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  const effortRaw = (env.ANTHROPIC_EFFORT ?? "high").toLowerCase();
  return {
    llmProvider: provider === "mock" ? "mock" : "anthropic",
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    // Claude Opus 5.5 er den aktuelle Opus-model (Claude 4-generationen er forældet).
    model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
    effort: effortRaw === "off" || effortRaw === "" ? undefined : EFFORTS.includes(effortRaw as Effort) ? (effortRaw as Effort) : "high",
    adaptiveThinking: (env.ANTHROPIC_THINKING ?? "adaptive").toLowerCase() !== "off",
    fallbacks: (env.ANTHROPIC_FALLBACKS ?? "default").toLowerCase() !== "off",
    maxTokens: int(env.ANTHROPIC_MAX_TOKENS, 64000),
    structuredMode: (env.STRUCTURED_OUTPUT ?? "schema").toLowerCase() === "prompt" ? "prompt" : "schema",
    maxConcurrency: Math.max(1, int(env.LLM_MAX_CONCURRENCY, 2)),
    requestsPerMinute: Math.max(1, int(env.LLM_REQUESTS_PER_MINUTE, 20)),
    maxRetries: int(env.LLM_MAX_RETRIES, 4),
    requestTimeoutMs: int(env.LLM_TIMEOUT_MS, 15 * 60 * 1000),
    maxTranscriptChars: int(env.MAX_TRANSCRIPT_CHARS, 600_000),
    minTranscriptChars: int(env.MIN_TRANSCRIPT_CHARS, 80),
    mockDelayMs: int(env.MOCK_DELAY_MS, 1200),
  };
}
