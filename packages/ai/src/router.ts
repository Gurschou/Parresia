/**
 * Model Router — chooses the best model for each task.
 *
 * Routing is pure configuration (RoutingPolicy): a preference list of
 * providers per task kind. The router walks the preference list, skips
 * unavailable providers, and falls back automatically. Nothing is
 * hardcoded — policies can be replaced at runtime.
 */
import {
  err,
  ModelUnavailableError,
  type Result,
} from "@synapse/shared";
import type {
  ChatModel,
  CompletionRequest,
  CompletionResponse,
  ProviderId,
  TaskKind,
} from "./types.js";

export type RoutingPolicy = Record<TaskKind, ProviderId[]>;

/**
 * Default policy:
 *   creative writing / coding / coaching → Claude
 *   reasoning / decision analysis        → GPT
 *   translation                          → Gemini
 *   fast tasks / extraction              → Mistral
 * Every task lists fallbacks so a missing key degrades gracefully.
 */
export const defaultRoutingPolicy: RoutingPolicy = {
  "creative-writing": ["anthropic", "openai", "mistral", "mock"],
  reasoning: ["openai", "anthropic", "google", "mock"],
  translation: ["google", "openai", "mistral", "mock"],
  coding: ["anthropic", "openai", "mistral", "mock"],
  fast: ["mistral", "google", "openai", "mock"],
  coaching: ["anthropic", "openai", "mistral", "mock"],
  intake: ["anthropic", "openai", "mistral", "mock"],
  briefing: ["openai", "anthropic", "mistral", "mock"],
  "emotional-analysis": ["anthropic", "openai", "mistral", "mock"],
  "pattern-analysis": ["anthropic", "openai", "mistral", "mock"],
  "decision-analysis": ["openai", "anthropic", "mistral", "mock"],
  "memory-extraction": ["mistral", "openai", "anthropic", "mock"],
  summarization: ["mistral", "google", "openai", "mock"],
};

export class ModelRouter {
  private readonly models = new Map<ProviderId, ChatModel>();
  private policy: RoutingPolicy;

  constructor(models: ChatModel[], policy: RoutingPolicy = defaultRoutingPolicy) {
    for (const model of models) this.models.set(model.provider, model);
    this.policy = policy;
  }

  /** Replace the routing policy at runtime (e.g. from admin config). */
  setPolicy(policy: RoutingPolicy): void {
    this.policy = policy;
  }

  /** Register or replace a provider without restarting. */
  register(model: ChatModel): void {
    this.models.set(model.provider, model);
  }

  /** Which provider would serve this task right now. */
  resolve(task: TaskKind): ChatModel | undefined {
    for (const providerId of this.policy[task] ?? []) {
      const model = this.models.get(providerId);
      if (model?.isAvailable()) return model;
    }
    return undefined;
  }

  async complete(
    request: CompletionRequest,
  ): Promise<Result<CompletionResponse>> {
    const preferences = this.policy[request.task] ?? [];
    let lastError: Error | undefined;
    for (const providerId of preferences) {
      const model = this.models.get(providerId);
      if (!model?.isAvailable()) continue;
      const result = await model.complete(request);
      if (result.ok) return result;
      lastError = result.error;
    }
    return err(
      lastError ??
        new ModelUnavailableError(
          `no provider available for task '${request.task}'`,
        ),
    );
  }
}
