/**
 * Composition helper: build a fully configured ModelRouter from environment
 * configuration. Providers with missing keys are still registered but
 * report unavailable, so the router falls through to the next preference
 * and ultimately to the mock provider.
 */
import { ModelRouter, defaultRoutingPolicy, type RoutingPolicy } from "./router.js";
import { AnthropicModel } from "./providers/anthropic.js";
import { GoogleModel } from "./providers/google.js";
import { OpenAiCompatibleModel } from "./providers/openai-compatible.js";
import { MockModel } from "./providers/mock.js";

export interface RouterEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_MODEL?: string;
  MISTRAL_API_KEY?: string;
  MISTRAL_MODEL?: string;
  /** Optional OpenAI-compatible open source endpoint (vLLM, Ollama…). */
  OSS_BASE_URL?: string;
  OSS_API_KEY?: string;
  OSS_MODEL?: string;
}

export function createModelRouter(
  env: RouterEnv = process.env as RouterEnv,
  policy: RoutingPolicy = defaultRoutingPolicy,
): ModelRouter {
  const models = [
    new AnthropicModel({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    }),
    new OpenAiCompatibleModel({
      provider: "openai",
      model: env.OPENAI_MODEL ?? "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
    }),
    new GoogleModel({ apiKey: env.GOOGLE_API_KEY, model: env.GOOGLE_MODEL }),
    new OpenAiCompatibleModel({
      provider: "mistral",
      model: env.MISTRAL_MODEL ?? "mistral-large-latest",
      baseUrl: "https://api.mistral.ai/v1",
      apiKey: env.MISTRAL_API_KEY,
    }),
    ...(env.OSS_BASE_URL
      ? [
          new OpenAiCompatibleModel({
            provider: "open-source",
            model: env.OSS_MODEL ?? "local",
            baseUrl: env.OSS_BASE_URL,
            apiKey: env.OSS_API_KEY ?? "local",
          }),
        ]
      : []),
    new MockModel(),
  ];
  return new ModelRouter(models, policy);
}
