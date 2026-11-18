import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { loadConfig, type CoreConfig, type StructuredMode } from "../config";
import {
  ModelingMapSchema,
  heuristicModelingMap,
  verifyModelingMap,
  type ModelingMap,
  type ModelingMapResult,
  type ModelingSource,
} from "../insights/modeling-map";
import type { RateLimiter } from "../llm/rate-limiter";
import { withRetry } from "../llm/retry";
import type { LlmClient, LlmResponse } from "../llm/types";
import { buildModelingMessage } from "../prompt/build-modeling-message";
import { SYSTEM_PROMPT } from "../prompt/system-prompt";
import { createLlmClient, getSharedLimiter } from "./analyze";
import { coerceToSchema, extractJson } from "./coerce";
import { AnalysisError, toAnalysisError } from "./errors";

export const MODELING_API_JSON_SCHEMA = zodOutputFormat(ModelingMapSchema).schema as Record<string, unknown>;
const FULL_SCHEMA = z.toJSONSchema(ModelingMapSchema) as Parameters<typeof coerceToSchema>[1];

export type ModelingMapSourceKind = "claude" | "heuristic";

export interface ModelingRun {
  result: ModelingMapResult;
  source: ModelingMapSourceKind;
  meta: {
    provider: "anthropic" | "mock" | "none";
    model: string;
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    /** Sat, når Claude ikke kunne svare og det tekstbaserede kort blev brugt. */
    fallback_reason?: string;
  };
}

export interface ModelPersonOptions {
  llm?: LlmClient;
  limiter?: RateLimiter;
  config?: Partial<CoreConfig>;
  signal?: AbortSignal;
  /** Kun til tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** false = kun det tekstbaserede kort (ingen LLM-kald). */
  useLlm?: boolean;
}

/** Validerer et rå modelsvar (bruges også af artifactet). */
export function parseModelingResponse(text: string): { ok: true; value: ModelingMap } | { ok: false; issues: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false, issues: "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt." };
  }
  const { value } = coerceToSchema(raw, FULL_SCHEMA);
  const parsed = ModelingMapSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues
      .slice(0, 12)
      .map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`)
      .join("\n"),
  };
}

/**
 * Gustavs modellering af én person ud fra alle personens samtaler. Claude får
 * den uændrede SYSTEM_PROMPT og metoden i brugerbeskeden; svaret efterprøves
 * mod transskripterne (`verifyModelingMap`). Fejler Claude, bygges det
 * tekstbaserede kort, så brugeren altid får et resultat.
 */
export async function modelPerson(source: ModelingSource, options: ModelPersonOptions = {}): Promise<ModelingRun> {
  if (!source.sessions.length || !source.sessions.some((s) => s.transcript.trim())) {
    throw new AnalysisError("input_empty");
  }
  const started = Date.now();
  const heuristic = (provider: ModelingRun["meta"]["provider"], reason?: string): ModelingRun => ({
    result: verifyModelingMap(heuristicModelingMap(source), source),
    source: "heuristic",
    meta: { provider, model: "", duration_ms: Date.now() - started, input_tokens: 0, output_tokens: 0, ...(reason ? { fallback_reason: reason } : {}) },
  });
  if (options.useLlm === false) return heuristic("none");

  const cfg = { ...loadConfig(), ...options.config };
  let llm: LlmClient;
  try {
    llm = options.llm ?? createLlmClient(cfg);
  } catch (err) {
    return heuristic("none", toAnalysisError(err).userMessage);
  }

  try {
    const res = await callForMap(source, llm, options.limiter ?? getSharedLimiter(cfg), cfg, options);
    return {
      result: verifyModelingMap(res.value, source),
      source: llm.provider === "mock" ? "heuristic" : "claude",
      meta: {
        provider: llm.provider,
        model: res.model,
        duration_ms: Date.now() - started,
        input_tokens: res.usage.input,
        output_tokens: res.usage.output,
      },
    };
  } catch (err) {
    const e = toAnalysisError(err);
    if (e.code === "aborted") throw e;
    return heuristic(llm.provider, e.userMessage);
  }
}

async function callForMap(
  source: ModelingSource,
  llm: LlmClient,
  limiter: RateLimiter,
  cfg: CoreConfig,
  options: ModelPersonOptions,
): Promise<{ value: ModelingMap; model: string; usage: { input: number; output: number } }> {
  let mode: StructuredMode = cfg.structuredMode;
  let repairNote: string | undefined;
  const usage = { input: 0, output: 0 };

  for (let round = 0; round < 3; round++) {
    const userMessage = buildModelingMessage({
      source,
      mode,
      jsonSchema: mode === "prompt" ? MODELING_API_JSON_SCHEMA : undefined,
      repairNote,
    });
    let res: LlmResponse;
    try {
      res = await withRetry(
        () =>
          limiter.schedule(async () => {
            try {
              return await llm.complete({
                system: SYSTEM_PROMPT,
                userMessage,
                jsonSchema: mode === "schema" ? MODELING_API_JSON_SCHEMA : undefined,
                maxTokens: cfg.maxTokens,
                signal: options.signal,
              });
            } catch (err) {
              throw toAnalysisError(err);
            }
          }, options.signal),
        {
          retries: cfg.maxRetries,
          signal: options.signal,
          sleep: options.sleep,
          shouldRetry: (e) => e instanceof AnalysisError && e.retryable,
          retryAfterMs: (e) => (e instanceof AnalysisError ? e.retryAfterMs : undefined),
        },
      );
    } catch (err) {
      const e = toAnalysisError(err);
      if (e.code === "schema_too_complex" && mode === "schema") {
        mode = "prompt";
        continue;
      }
      throw e;
    }
    usage.input += res.usage.inputTokens;
    usage.output += res.usage.outputTokens;
    if (res.stopReason === "refusal") throw new AnalysisError("refusal");
    if (res.stopReason === "max_tokens") throw new AnalysisError("truncated");

    const parsed = parseModelingResponse(res.text);
    if (parsed.ok) return { value: parsed.value, model: res.model || llm.model, usage };
    if (round >= 1) throw new AnalysisError("invalid_output", { details: parsed.issues.split("\n").slice(0, 6).join("; ") });
    repairNote = parsed.issues;
  }
  throw new AnalysisError("invalid_output");
}
