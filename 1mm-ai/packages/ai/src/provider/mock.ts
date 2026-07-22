import { EMBEDDING_DIMENSIONS } from "@1mm/database";
import type {
  AIProvider,
  CompleteOptions,
  CreateRealtimeSecretOptions,
  ProviderStreamPart,
  RealtimeClientSecret,
  StreamChatOptions,
} from "./types";

/**
 * Deterministic offline provider used by automated tests and `MOCK_AI=1`.
 * Never calls the network, so tests never hit the real OpenAI API.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly textModel = "mock-text-model";
  readonly realtimeModel = "mock-realtime-model";

  async *streamChat(options: StreamChatOptions): AsyncIterable<ProviderStreamPart> {
    const lastUser = [...options.input]
      .reverse()
      .find((m) => m.kind === "message" && m.role === "user");
    const userText = lastUser && lastUser.kind === "message" ? lastUser.content : "";

    // Deterministic tool-call path used by tool-layer tests.
    const wantsTool =
      options.tools?.some((t) => t.name === "get_current_user_profile") &&
      /profil|profile/i.test(userText) &&
      !options.input.some((m) => m.kind === "function_call_output");

    if (wantsTool) {
      yield {
        type: "tool_call",
        callId: "mock-call-1",
        name: "get_current_user_profile",
        arguments: "{}",
      };
      yield { type: "completed", fullText: "", usage: { inputTokens: 10, outputTokens: 0 } };
      return;
    }

    const toolOutput = options.input.find((m) => m.kind === "function_call_output");
    const reply = toolOutput
      ? `Her er din profil (via værktøj): ${toolOutput.kind === "function_call_output" ? toolOutput.output : ""}`
      : `Dette er et testsvar fra 1MM AI. Du skrev: "${userText}"`;

    let fullText = "";
    for (const word of reply.split(/(?<=\s)/)) {
      if (options.signal?.aborted) return;
      fullText += word;
      yield { type: "delta", text: word };
      // Small delay so streaming behaviour is observable in dev/e2e.
      await new Promise((r) => setTimeout(r, 5));
    }
    yield {
      type: "completed",
      fullText,
      usage: { inputTokens: 42, outputTokens: reply.split(" ").length },
    };
  }

  async complete(options: CompleteOptions): Promise<string> {
    if (options.instructions.includes("MEMORY_EXTRACTION")) {
      // Deterministic extraction: only remember explicit "husk at …" requests.
      const match = options.prompt.match(/husk(?: at| også at)? ([^.\n!?]+)/i);
      if (match?.[1]) {
        return JSON.stringify([
          {
            category: "fact",
            content: match[1].trim(),
            importance: 0.8,
            confidence: 0.9,
            sensitive: false,
          },
        ]);
      }
      return "[]";
    }
    if (options.instructions.includes("TITLE_GENERATION")) {
      const firstLine = options.prompt.split("\n").find((l) => l.trim().length > 0) ?? "Samtale";
      return firstLine.replace(/^(user|assistant):\s*/i, "").slice(0, 40);
    }
    if (options.instructions.includes("SUMMARY_GENERATION")) {
      return `Resumé: ${options.prompt.slice(0, 200)}`;
    }
    return "OK";
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Deterministic pseudo-embeddings: identical texts map to identical
    // vectors, similar-prefix texts stay close – good enough for tests.
    return texts.map((text) => {
      const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      for (let i = 0; i < text.length; i++) {
        const idx = (text.charCodeAt(i) * 31 + i * 7) % EMBEDDING_DIMENSIONS;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    });
  }

  async createRealtimeClientSecret(
    _options: CreateRealtimeSecretOptions,
  ): Promise<RealtimeClientSecret> {
    return {
      value: `ek_mock_${Math.random().toString(36).slice(2, 10)}`,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      model: this.realtimeModel,
    };
  }
}
