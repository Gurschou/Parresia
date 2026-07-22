import { getAIEnv } from "../env";
import { MockAIProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Factory for the active provider. `MOCK_AI=1` (or a missing API key outside
 * production) selects the deterministic mock so the app runs offline.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const env = getAIEnv();
  if (env.mockEnabled || (!env.apiKey && process.env.NODE_ENV !== "production")) {
    cached = new MockAIProvider();
  } else {
    cached = new OpenAIProvider();
  }
  return cached;
}

/** Test seam. */
export function setAIProviderForTesting(provider: AIProvider | null): void {
  cached = provider;
}
