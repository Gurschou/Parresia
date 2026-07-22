import { z } from "zod";
import { LIMITS } from "@1mm/shared";
import { MEMORY_EXTRACTION_INSTRUCTION } from "../prompts";
import type { AIProvider } from "../provider/types";

export const memoryCandidateSchema = z.object({
  category: z.enum(["preference", "project", "goal", "work_method", "fact", "other"]),
  content: z.string().trim().min(1).max(LIMITS.maxMemoryLength),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  sensitive: z.boolean(),
});
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;

/** Confidence below this is discarded – better to forget than to guess. */
const MIN_CONFIDENCE = 0.6;
const MAX_CANDIDATES_PER_RUN = 5;

/**
 * Ask the model for memory candidates from a conversation transcript.
 * Sensitive or low-confidence candidates are filtered out server-side so a
 * misbehaving model output can never bypass the policy.
 */
export async function extractMemoryCandidates(
  provider: AIProvider,
  transcript: string,
): Promise<MemoryCandidate[]> {
  const raw = await provider.complete({
    instructions: MEMORY_EXTRACTION_INSTRUCTION,
    prompt: transcript.slice(0, 12_000),
    maxOutputTokens: 800,
  });

  const parsed = safeParseJsonArray(raw);
  const candidates: MemoryCandidate[] = [];
  for (const item of parsed) {
    const result = memoryCandidateSchema.safeParse(item);
    if (!result.success) continue;
    if (result.data.sensitive) continue;
    if (result.data.confidence < MIN_CONFIDENCE) continue;
    candidates.push(result.data);
    if (candidates.length >= MAX_CANDIDATES_PER_RUN) break;
  }
  return candidates;
}

function safeParseJsonArray(raw: string): unknown[] {
  // Models sometimes wrap JSON in code fences – strip them defensively.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const value: unknown = JSON.parse(cleaned);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
