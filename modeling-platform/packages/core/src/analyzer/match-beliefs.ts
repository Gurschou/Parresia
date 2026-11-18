import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { loadConfig, type CoreConfig, type StructuredMode } from "../config";
import {
  BeliefMatchResponseSchema,
  heuristicMatches,
  resolveMatches,
  type BeliefInventory,
  type BeliefMatch,
  type BeliefMatchResponse,
  type MatchSource,
} from "../insights/belief-match";
import type { RateLimiter } from "../llm/rate-limiter";
import { withRetry } from "../llm/retry";
import type { LlmClient, LlmResponse } from "../llm/types";
import { buildBeliefMatchMessage } from "../prompt/build-belief-match-message";
import { SYSTEM_PROMPT } from "../prompt/system-prompt";
import { createLlmClient, getSharedLimiter } from "./analyze";
import { coerceToSchema, extractJson } from "./coerce";
import { AnalysisError, toAnalysisError } from "./errors";

export const BELIEF_MATCH_API_JSON_SCHEMA = zodOutputFormat(BeliefMatchResponseSchema).schema as Record<string, unknown>;
const FULL_SCHEMA = z.toJSONSchema(BeliefMatchResponseSchema) as Parameters<typeof coerceToSchema>[1];

export interface BeliefMatchRun {
  matches: BeliefMatch[];
  summary: string;
  source: MatchSource;
  meta: {
    provider: "anthropic" | "mock" | "none";
    model: string;
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    /** Sat, når Claude ikke kunne svare og den tekstbaserede match blev brugt. */
    fallback_reason?: string;
  };
}

export interface MatchBeliefsOptions {
  llm?: LlmClient;
  limiter?: RateLimiter;
  config?: Partial<CoreConfig>;
  signal?: AbortSignal;
  /** Kun til tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** false = brug kun den tekstbaserede match (ingen LLM-kald). */
  useLlm?: boolean;
}

const hasMaterial = (inv: BeliefInventory) => {
  const target = inv.persons.find((p) => p.id === inv.target);
  const others = inv.persons.filter((p) => p.id !== inv.target);
  return !!target && others.length > 0 && (target.beliefs.length > 0 || others.some((p) => p.beliefs.length > 0));
};

/**
 * Finder overbevisninger, der passer mellem målpersonen og alle andre — begge
 * veje. Bruger Claude (samme uændrede SYSTEM_PROMPT som analysen, opgaven i
 * brugerbeskeden) og validerer svaret lokalt. Fejler Claude, bruges den
 * tekstbaserede match, så brugeren altid får et resultat.
 */
export async function matchBeliefs(inventory: BeliefInventory, options: MatchBeliefsOptions = {}): Promise<BeliefMatchRun> {
  const started = Date.now();
  const heuristic = (provider: BeliefMatchRun["meta"]["provider"], reason?: string): BeliefMatchRun => {
    const res = heuristicMatches(inventory);
    return {
      matches: resolveMatches(inventory, res.matches),
      summary: res.summary,
      source: "heuristic",
      meta: { provider, model: "", duration_ms: Date.now() - started, input_tokens: 0, output_tokens: 0, ...(reason ? { fallback_reason: reason } : {}) },
    };
  };
  if (!hasMaterial(inventory)) return { ...heuristic("none"), summary: "" };
  if (options.useLlm === false) return heuristic("none");

  const cfg = { ...loadConfig(), ...options.config };
  let llm: LlmClient;
  try {
    llm = options.llm ?? createLlmClient(cfg);
  } catch (err) {
    return heuristic("none", toAnalysisError(err).userMessage);
  }

  try {
    const res = await callForMatches(inventory, llm, options.limiter ?? getSharedLimiter(cfg), cfg, options);
    return {
      matches: resolveMatches(inventory, res.value.matches),
      summary: res.value.summary.trim(),
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

async function callForMatches(
  inventory: BeliefInventory,
  llm: LlmClient,
  limiter: RateLimiter,
  cfg: CoreConfig,
  options: MatchBeliefsOptions,
): Promise<{ value: BeliefMatchResponse; model: string; usage: { input: number; output: number } }> {
  let mode: StructuredMode = cfg.structuredMode;
  let repairNote: string | undefined;
  const usage = { input: 0, output: 0 };

  for (let round = 0; round < 3; round++) {
    const userMessage = buildBeliefMatchMessage({
      inventory,
      mode,
      jsonSchema: mode === "prompt" ? BELIEF_MATCH_API_JSON_SCHEMA : undefined,
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
                jsonSchema: mode === "schema" ? BELIEF_MATCH_API_JSON_SCHEMA : undefined,
                maxTokens: Math.min(cfg.maxTokens, 32000),
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

    let raw: unknown;
    try {
      raw = extractJson(res.text);
    } catch (err) {
      if (round >= 1) throw new AnalysisError("invalid_output", { details: "Svaret var ikke gyldig JSON.", cause: err });
      repairNote = "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt.";
      continue;
    }
    const { value } = coerceToSchema(raw, FULL_SCHEMA);
    const parsed = BeliefMatchResponseSchema.safeParse(value);
    if (!parsed.success) {
      if (round >= 1) throw new AnalysisError("invalid_output", { details: parsed.error.issues.slice(0, 8).map((i) => i.message).join("; ") });
      repairNote = parsed.error.issues
        .slice(0, 12)
        .map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`)
        .join("\n");
      continue;
    }
    return { value: parsed.data, model: res.model || llm.model, usage };
  }
  throw new AnalysisError("invalid_output");
}
