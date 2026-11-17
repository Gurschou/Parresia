import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ANALYSIS_SCHEMA_VERSION,
  AnalysisResultSchema,
  CATEGORIES,
  normalizeResult,
  type AnalysisResult,
} from "../categories/registry";
import type { CategoryDefinition } from "../categories/types";
import { loadConfig, type CoreConfig, type StructuredMode } from "../config";
import { countVakogPredicates, type LexiconCounts } from "../insights/vakog-lexicon";
import { AnthropicLlmClient } from "../llm/anthropic";
import { MockLlmClient } from "../llm/mock";
import { RateLimiter } from "../llm/rate-limiter";
import { withRetry } from "../llm/retry";
import type { LlmClient, LlmResponse } from "../llm/types";
import { buildUserMessage, type AnalysisContext } from "../prompt/build-user-message";
import { SYSTEM_PROMPT } from "../prompt/system-prompt";
import { coerceToSchema, extractJson } from "./coerce";
import { AnalysisError, toAnalysisError } from "./errors";

export interface AnalyzeInput {
  transcript: string;
  context?: AnalysisContext;
}

export type AnalysisStage = "preparing" | "queued" | "analyzing" | "receiving" | "validating" | "repairing" | "done";

export interface AnalysisProgress {
  stage: AnalysisStage;
  message: string;
  receivedChars?: number;
  attempt?: number;
}

export interface AnalyzeOptions {
  llm?: LlmClient;
  limiter?: RateLimiter;
  config?: Partial<CoreConfig>;
  signal?: AbortSignal;
  onProgress?: (p: AnalysisProgress) => void;
  /** Kun til tests: overstyr ventetid i retries. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface AnalysisMeta {
  provider: "anthropic" | "mock";
  model: string;
  structured_mode: StructuredMode;
  created_at: string;
  duration_ms: number;
  attempts: number;
  repaired: boolean;
  fallback_used: boolean;
  input_tokens: number;
  output_tokens: number;
  transcript_chars: number;
  fixes: string[];
  lexicon: LexiconCounts;
}

export interface AnalysisEnvelope {
  schema_version: number;
  result: AnalysisResult;
  meta: AnalysisMeta;
}

export const AnalysisEnvelopeSchema = z.object({
  schema_version: z.number(),
  result: AnalysisResultSchema,
  meta: z.record(z.string(), z.unknown()),
});

/** JSON-schema til `output_config.format` (unsupported constraints flyttes til beskrivelser af SDK'en). */
export const ANALYSIS_OUTPUT_FORMAT = zodOutputFormat(AnalysisResultSchema);
export const ANALYSIS_API_JSON_SCHEMA = ANALYSIS_OUTPUT_FORMAT.schema as Record<string, unknown>;
/** Fuldt JSON-schema inkl. min/max — bruges til lokal coercion og `modeling-cli schema`. */
export const ANALYSIS_FULL_JSON_SCHEMA = z.toJSONSchema(AnalysisResultSchema) as Record<string, unknown>;

let sharedLimiter: RateLimiter | null = null;
/** Én fælles limiter pr. proces, så samtidige web-jobs deler kvoten. */
export function getSharedLimiter(cfg: CoreConfig = loadConfig()): RateLimiter {
  sharedLimiter ??= new RateLimiter({ maxConcurrent: cfg.maxConcurrency, maxRequests: cfg.requestsPerMinute });
  return sharedLimiter;
}

export function createLlmClient(cfg: CoreConfig = loadConfig()): LlmClient {
  if (cfg.llmProvider === "mock") return new MockLlmClient({ delayMs: cfg.mockDelayMs });
  if (!cfg.anthropicApiKey && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AnalysisError("missing_api_key");
  return new AnthropicLlmClient({
    apiKey: cfg.anthropicApiKey,
    model: cfg.model,
    effort: cfg.effort,
    adaptiveThinking: cfg.adaptiveThinking,
    fallbacks: cfg.fallbacks,
    timeoutMs: cfg.requestTimeoutMs,
  });
}

function formatIssues(err: z.ZodError, max = 12): string {
  const lines = err.issues.slice(0, max).map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`);
  if (err.issues.length > max) lines.push(`- … og ${err.issues.length - max} flere`);
  return lines.join("\n");
}

/**
 * Kører den fulde adfærdsanalyse af et transskript.
 *
 * Flow: validér input → byg brugerbesked → Claude (rate-limit + retry) →
 * tjek stop_reason → parse → schema-styret oprydning → Zod-validering →
 * kategori-normalisering. Ved valideringsfejl køres én reparationsrunde;
 * er schemaet for komplekst til structured outputs, skiftes til prompt-mode.
 */
export async function analyzeTranscript(input: AnalyzeInput, options: AnalyzeOptions = {}): Promise<AnalysisEnvelope> {
  const cfg = { ...loadConfig(), ...options.config };
  const started = Date.now();
  const progress = (p: AnalysisProgress) => options.onProgress?.(p);

  const transcript = (input.transcript ?? "").replace(/\r\n/g, "\n").trim();
  if (transcript.length < cfg.minTranscriptChars) {
    throw new AnalysisError("input_empty", {
      details: `Transskriptet har ${transcript.length} tegn (minimum ${cfg.minTranscriptChars}).`,
    });
  }
  if (transcript.length > cfg.maxTranscriptChars) {
    throw new AnalysisError("input_too_long", {
      details: `Transskriptet har ${transcript.length} tegn (maksimum ${cfg.maxTranscriptChars}).`,
    });
  }

  progress({ stage: "preparing", message: "Forbereder analysen" });
  const llm = options.llm ?? createLlmClient(cfg);
  const limiter = options.limiter ?? getSharedLimiter(cfg);
  const categories = CATEGORIES as readonly CategoryDefinition[];

  let mode: StructuredMode = cfg.structuredMode;
  let repairNote: string | undefined;
  let attempts = 0;
  let repaired = false;
  let fallbackUsed = false;
  const usage = { input: 0, output: 0 };
  let lastModel = llm.model;

  const callModel = async (): Promise<LlmResponse> => {
    const userMessage = buildUserMessage({
      transcript,
      categories,
      context: input.context,
      mode,
      jsonSchema: mode === "prompt" ? ANALYSIS_API_JSON_SCHEMA : undefined,
      repairNote,
    });
    return withRetry(
      async (attempt) => {
        attempts++;
        if (limiter.running >= limiter.maxConcurrent || limiter.pending > 0) {
          progress({ stage: "queued", message: "Venter på ledig plads hos Claude (rate limit)", attempt });
        }
        return limiter.schedule(async () => {
          progress({ stage: "analyzing", message: "Claude analyserer transskriptet", attempt });
          try {
            return await llm.complete({
              system: SYSTEM_PROMPT,
              userMessage,
              jsonSchema: mode === "schema" ? ANALYSIS_API_JSON_SCHEMA : undefined,
              maxTokens: cfg.maxTokens,
              signal: options.signal,
              onText: (n) => progress({ stage: "receiving", message: "Modtager struktureret svar", receivedChars: n }),
            });
          } catch (err) {
            throw toAnalysisError(err);
          }
        }, options.signal);
      },
      {
        retries: cfg.maxRetries,
        signal: options.signal,
        sleep: options.sleep,
        shouldRetry: (e) => e instanceof AnalysisError && e.retryable,
        retryAfterMs: (e) => (e instanceof AnalysisError ? e.retryAfterMs : undefined),
        onRetry: ({ attempt, delayMs, error }) =>
          progress({
            stage: "queued",
            message: `${error instanceof AnalysisError ? error.userMessage : "Midlertidig fejl"} Nyt forsøg om ${Math.ceil(delayMs / 1000)} s (forsøg ${attempt + 1}).`,
            attempt,
          }),
      },
    );
  };

  for (let round = 0; round < 3; round++) {
    let res: LlmResponse;
    try {
      res = await callModel();
    } catch (err) {
      const e = toAnalysisError(err);
      if (e.code === "schema_too_complex" && mode === "schema") {
        mode = "prompt"; // Fald tilbage til schema-i-prompt + lokal validering.
        continue;
      }
      throw e;
    }
    usage.input += res.usage.inputTokens;
    usage.output += res.usage.outputTokens;
    fallbackUsed ||= res.fallbackUsed;
    lastModel = res.model || lastModel;

    if (res.stopReason === "refusal") {
      throw new AnalysisError("refusal", {
        details: res.refusalCategory ? `Kategori: ${res.refusalCategory}` : undefined,
      });
    }
    if (res.stopReason === "max_tokens") throw new AnalysisError("truncated");

    progress({ stage: "validating", message: "Validerer analysen mod schemaet" });
    let raw: unknown;
    try {
      raw = extractJson(res.text);
    } catch (err) {
      if (round >= 1) throw new AnalysisError("invalid_output", { details: "Svaret var ikke gyldig JSON.", cause: err });
      repairNote = "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt.";
      repaired = true;
      progress({ stage: "repairing", message: "Retter et ugyldigt svar (reparationsrunde)" });
      continue;
    }

    const { value, fixes } = coerceToSchema(raw, ANALYSIS_FULL_JSON_SCHEMA as Parameters<typeof coerceToSchema>[1]);
    const parsed = AnalysisResultSchema.safeParse(value);
    if (!parsed.success) {
      if (round >= 1) {
        throw new AnalysisError("invalid_output", { details: formatIssues(parsed.error) });
      }
      repairNote = formatIssues(parsed.error);
      repaired = true;
      progress({ stage: "repairing", message: "Retter valideringsfejl (reparationsrunde)" });
      continue;
    }

    const result = normalizeResult(parsed.data);
    progress({ stage: "done", message: "Analysen er færdig" });
    return {
      schema_version: ANALYSIS_SCHEMA_VERSION,
      result,
      meta: {
        provider: llm.provider,
        model: lastModel,
        structured_mode: mode,
        created_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        attempts,
        repaired,
        fallback_used: fallbackUsed,
        input_tokens: usage.input,
        output_tokens: usage.output,
        transcript_chars: transcript.length,
        fixes,
        lexicon: countVakogPredicates(transcript),
      },
    };
  }
  throw new AnalysisError("invalid_output");
}

/** Validerer en gemt analyse (fx fra `modeling-cli validate`). */
export function validateAnalysis(data: unknown): { ok: true; result: AnalysisResult } | { ok: false; issues: string } {
  const candidate = data && typeof data === "object" && "result" in data ? (data as { result: unknown }).result : data;
  const parsed = AnalysisResultSchema.safeParse(candidate);
  return parsed.success ? { ok: true, result: parsed.data } : { ok: false, issues: formatIssues(parsed.error, 50) };
}
