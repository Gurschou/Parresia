import OpenAI from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import { getAIEnv } from "../env";
import { toProviderError } from "./errors";
import type {
  AIProvider,
  CompleteOptions,
  CreateRealtimeSecretOptions,
  ModelMessage,
  ProviderStreamPart,
  RealtimeClientSecret,
  StreamChatOptions,
  ToolDefinition,
} from "./types";

function toResponseInput(messages: ModelMessage[]): ResponseInput {
  return messages.map((m) => {
    switch (m.kind) {
      case "message":
        return { role: m.role, content: m.content };
      case "function_call":
        return {
          type: "function_call" as const,
          call_id: m.callId,
          name: m.name,
          arguments: m.arguments,
        };
      case "function_call_output":
        return { type: "function_call_output" as const, call_id: m.callId, output: m.output };
    }
  });
}

function toResponseTools(tools: ToolDefinition[] | undefined): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

const TRANSCRIPTION_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "gpt-4o-transcribe-latest",
  "whisper-1",
] as const;
type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number];

function getTranscriptionModel(): TranscriptionModel {
  const fromEnv = process.env.OPENAI_TRANSCRIBE_MODEL;
  if (fromEnv && (TRANSCRIPTION_MODELS as readonly string[]).includes(fromEnv)) {
    return fromEnv as TranscriptionModel;
  }
  return "gpt-4o-mini-transcribe";
}

/** Production provider backed by the official OpenAI SDK (Responses API). */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly textModel: string;
  readonly realtimeModel: string;
  private readonly embeddingModel: string;
  private readonly client: OpenAI;

  constructor() {
    const env = getAIEnv();
    if (!env.apiKey) {
      throw new Error("OPENAI_API_KEY is not set (server-side only)");
    }
    this.client = new OpenAI({ apiKey: env.apiKey, maxRetries: 2, timeout: 60_000 });
    this.textModel = env.textModel;
    this.realtimeModel = env.realtimeModel;
    this.embeddingModel = env.embeddingModel;
  }

  async *streamChat(options: StreamChatOptions): AsyncIterable<ProviderStreamPart> {
    let fullText = "";
    try {
      const stream = await this.client.responses.create(
        {
          model: this.textModel,
          instructions: options.instructions,
          input: toResponseInput(options.input),
          tools: toResponseTools(options.tools),
          max_output_tokens: options.maxOutputTokens ?? 2_048,
          stream: true,
        },
        { signal: options.signal },
      );

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          fullText += event.delta;
          yield { type: "delta", text: event.delta };
        } else if (event.type === "response.output_item.done") {
          const item = event.item;
          if (item.type === "function_call") {
            yield {
              type: "tool_call",
              callId: item.call_id,
              name: item.name,
              arguments: item.arguments,
            };
          }
        } else if (event.type === "response.completed") {
          const usage = event.response.usage;
          yield {
            type: "completed",
            fullText,
            usage: usage
              ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
              : null,
          };
        } else if (event.type === "response.failed") {
          throw new Error(event.response.error?.message ?? "Response failed");
        }
      }
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async complete(options: CompleteOptions): Promise<string> {
    try {
      const response = await this.client.responses.create(
        {
          model: this.textModel,
          instructions: options.instructions,
          input: options.prompt,
          max_output_tokens: options.maxOutputTokens ?? 512,
        },
        { signal: options.signal },
      );
      return response.output_text;
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async createRealtimeClientSecret(
    options: CreateRealtimeSecretOptions,
  ): Promise<RealtimeClientSecret> {
    try {
      const secret = await this.client.realtime.clientSecrets.create(
        {
          expires_after: { anchor: "created_at", seconds: 600 },
          session: {
            type: "realtime",
            model: this.realtimeModel,
            instructions: options.instructions,
            audio: options.transcribeInput
              ? { input: { transcription: { model: getTranscriptionModel() } } }
              : undefined,
          },
        },
        {
          // Binds the ephemeral token to a pseudonymous user id for abuse
          // detection; the raw user id never leaves our backend.
          headers: { "OpenAI-Safety-Identifier": options.safetyIdentifier },
        },
      );
      return {
        value: secret.value,
        expiresAt: secret.expires_at,
        model: this.realtimeModel,
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
