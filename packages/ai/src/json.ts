/**
 * Robust JSON extraction from model output.
 * Models occasionally wrap JSON in prose or code fences; this strips both
 * before parsing so engines get structured data or a typed error.
 */
import {
  err,
  ok,
  ModelResponseInvalidError,
  type Result,
} from "@synapse/shared";

export function parseModelJson<T>(content: string): Result<T> {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const candidates = [unfenced];
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(unfenced.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      return ok(JSON.parse(candidate) as T);
    } catch {
      // try next candidate
    }
  }
  return err(
    new ModelResponseInvalidError(
      `model did not return valid JSON: ${trimmed.slice(0, 200)}`,
    ),
  );
}
