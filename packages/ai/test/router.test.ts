import { describe, expect, it } from "vitest";
import { unwrap, ok, err, ModelUnavailableError, type Result } from "@synapse/shared";
import { ModelRouter, defaultRoutingPolicy } from "../src/router.js";
import { MockModel } from "../src/providers/mock.js";
import type {
  ChatModel,
  CompletionRequest,
  CompletionResponse,
  ProviderId,
} from "../src/types.js";

function stubModel(
  provider: ProviderId,
  options: { available?: boolean; fails?: boolean } = {},
): ChatModel {
  return {
    provider,
    model: `${provider}-stub`,
    isAvailable: () => options.available ?? true,
    async complete(
      _request: CompletionRequest,
    ): Promise<Result<CompletionResponse>> {
      if (options.fails) {
        return err(new ModelUnavailableError(provider));
      }
      return ok({ content: `from-${provider}`, provider, model: `${provider}-stub` });
    },
  };
}

describe("ModelRouter", () => {
  it("routes each task to the preferred provider", async () => {
    const router = new ModelRouter([
      stubModel("anthropic"),
      stubModel("openai"),
      stubModel("google"),
      stubModel("mistral"),
    ]);
    const cases = [
      { task: "creative-writing", expected: "anthropic" },
      { task: "reasoning", expected: "openai" },
      { task: "translation", expected: "google" },
      { task: "coding", expected: "anthropic" },
      { task: "fast", expected: "mistral" },
    ] as const;
    for (const { task, expected } of cases) {
      const response = unwrap(
        await router.complete({ task, messages: [{ role: "user", content: "x" }] }),
      );
      expect(response.provider).toBe(expected);
    }
  });

  it("falls back when the preferred provider is unavailable", async () => {
    const router = new ModelRouter([
      stubModel("anthropic", { available: false }),
      stubModel("openai"),
    ]);
    const response = unwrap(
      await router.complete({
        task: "creative-writing",
        messages: [{ role: "user", content: "x" }],
      }),
    );
    expect(response.provider).toBe("openai");
  });

  it("falls back when the preferred provider errors", async () => {
    const router = new ModelRouter([
      stubModel("anthropic", { fails: true }),
      stubModel("openai"),
    ]);
    const response = unwrap(
      await router.complete({
        task: "coaching",
        messages: [{ role: "user", content: "x" }],
      }),
    );
    expect(response.provider).toBe("openai");
  });

  it("uses the mock provider when nothing else is configured", async () => {
    const router = new ModelRouter([
      stubModel("anthropic", { available: false }),
      new MockModel(),
    ]);
    const response = unwrap(
      await router.complete({
        task: "coaching",
        messages: [{ role: "user", content: "hej" }],
      }),
    );
    expect(response.provider).toBe("mock");
  });

  it("errors when no provider is available", async () => {
    const router = new ModelRouter([stubModel("anthropic", { available: false })]);
    const result = await router.complete({
      task: "reasoning",
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.ok).toBe(false);
  });

  it("policy can be replaced at runtime", async () => {
    const router = new ModelRouter([stubModel("anthropic"), stubModel("mistral")]);
    router.setPolicy({ ...defaultRoutingPolicy, coaching: ["mistral"] });
    const response = unwrap(
      await router.complete({
        task: "coaching",
        messages: [{ role: "user", content: "x" }],
      }),
    );
    expect(response.provider).toBe("mistral");
  });
});
