/**
 * Central place for AI-related environment configuration.
 * Models are never hardcoded at call sites – they always come from here.
 */
export interface AIEnv {
  apiKey: string | undefined;
  textModel: string;
  realtimeModel: string;
  embeddingModel: string;
  mockEnabled: boolean;
}

export function getAIEnv(): AIEnv {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    mockEnabled: process.env.MOCK_AI === "1",
  };
}
