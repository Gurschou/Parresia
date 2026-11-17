import {
  ANALYSIS_JSON_SCHEMA,
  AnalysisResultSchema,
  CATEGORIES,
  SYSTEM_PROMPT,
  buildUserMessage,
  coerceToSchema,
  extractJson,
  generateMockAnalysis,
  normalizeResult,
  type AnalysisContext,
  type AnalysisResult,
} from "./lib";
import type { SampleError, SampleFn } from "./runtime";

export const MAX_TRANSCRIPT_CHARS = 180_000;

export interface AnalyzeProgress {
  stage: "waiting" | "writing" | "validating" | "repairing";
  chars: number;
}

export interface AnalyzeOutcome {
  result: AnalysisResult;
  modelTier?: string;
  repaired: boolean;
  fixes: number;
}

/** Danske beskeder for sample-fejlkoder. */
export function sampleErrorMessage(e: unknown): string {
  const code = (e as SampleError)?.code;
  switch (code) {
    case "not_granted":
      return "Du har ikke givet siden lov til at bruge Claude. Du kan stadig køre en demo-analyse.";
    case "sampling_disabled":
    case "capability_disabled":
    case "capability_removed":
    case "not_declared":
      return "Claude er ikke tilgængelig i denne visning. Du kan køre en demo-analyse i stedet.";
    case "rate_limited":
      return "Grænsen for brug af Claude er nået lige nu. Prøv igen om lidt.";
    case "prompt_too_large":
      return "Transskriptet er for langt til én analyse. Forkort det, og prøv igen.";
    case "refused":
      return "Claude afviste at analysere dette materiale.";
    case "session_expired":
      return "Din session er udløbet. Log ind igen.";
    case "empty_completion":
    case "invalid_json":
      return "Svaret kunne ikke læses som en analyse. Prøv igen.";
    case "invalid_output":
      return "Svaret kunne ikke valideres mod analyse-schemaet, heller ikke efter en reparationsrunde.";
    case "cancelled":
      return "Analysen blev stoppet.";
    default:
      return "Der opstod en midlertidig fejl hos Claude. Prøv igen.";
  }
}

function validate(text: string): { ok: true; result: AnalysisResult; fixes: number } | { ok: false; issues: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false, issues: "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt." };
  }
  const { value, fixes } = coerceToSchema(raw, ANALYSIS_JSON_SCHEMA as Parameters<typeof coerceToSchema>[1]);
  const parsed = AnalysisResultSchema.safeParse(value);
  if (parsed.success) return { ok: true, result: normalizeResult(parsed.data), fixes: fixes.length };
  return {
    ok: false,
    issues: parsed.error.issues
      .slice(0, 12)
      .map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`)
      .join("\n"),
  };
}

/**
 * Rigtig analyse med Claude via artifactets `sample`-capability.
 * `sample` har ingen system-prompt, som siden styrer, så platformens
 * system-prompt sendes ORDRET som første blok i input, efterfulgt af samme
 * brugerbesked som web og CLI (prompt-mode: JSON-schemaet indlejret).
 * Svaret valideres med samme Zod-schema; ved fejl køres én reparationsrunde.
 */
export async function analyzeWithClaude(
  sample: SampleFn,
  input: { transcript: string; context: AnalysisContext },
  opts: { modelTier: "complex" | "default"; signal: AbortSignal; onProgress: (p: AnalyzeProgress) => void },
): Promise<AnalyzeOutcome> {
  const build = (repairNote?: string) =>
    `<system_prompt>\n${SYSTEM_PROMPT}\n</system_prompt>\n\n${buildUserMessage({
      transcript: input.transcript,
      categories: CATEGORIES,
      context: input.context,
      mode: "prompt",
      jsonSchema: ANALYSIS_JSON_SCHEMA,
      repairNote,
    })}`;

  const call = async (prompt: string, cache: boolean) => {
    opts.onProgress({ stage: "waiting", chars: 0 });
    return sample(prompt, {
      modelTier: opts.modelTier,
      signal: opts.signal,
      cache: cache ? { gcTime: 24 * 60 * 60 * 1000 } : false,
      onText: ({ text }) => opts.onProgress({ stage: "writing", chars: text.length }),
    });
  };

  const first = await call(build(), true);
  opts.onProgress({ stage: "validating", chars: first.text.length });
  const v1 = validate(first.text);
  if (v1.ok) return { result: v1.result, modelTier: first.modelTierApplied, repaired: false, fixes: v1.fixes };
  if (first.truncated) throw { code: "invalid_json", message: "truncated" } satisfies SampleError;

  opts.onProgress({ stage: "repairing", chars: 0 });
  const second = await call(build(v1.issues), false);
  const v2 = validate(second.text);
  if (v2.ok) return { result: v2.result, modelTier: second.modelTierApplied, repaired: true, fixes: v2.fixes };
  throw { code: "invalid_output", message: v2.issues } satisfies SampleError;
}

/** Demo-analyse uden Claude (deterministisk, bygget af transskriptet). */
export async function analyzeDemo(input: { transcript: string; context: AnalysisContext }, onProgress: (p: AnalyzeProgress) => void): Promise<AnalyzeOutcome> {
  onProgress({ stage: "waiting", chars: 0 });
  await new Promise((r) => setTimeout(r, 700));
  onProgress({ stage: "writing", chars: 12000 });
  await new Promise((r) => setTimeout(r, 700));
  const result = normalizeResult(generateMockAnalysis(input.transcript, input.context));
  return { result, repaired: false, fixes: 0 };
}
