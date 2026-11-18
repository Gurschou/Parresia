import path from "node:path";
import os from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    env: {
      DATABASE_URL: "memory://",
      LLM_PROVIDER: "mock",
      MOCK_DELAY_MS: "0",
      // Hver analyse giver tre mock-kald (analyse, match, modelleringskort); undgå at ramme kvoten.
      LLM_REQUESTS_PER_MINUTE: "1000",
      LLM_MAX_CONCURRENCY: "4",
      TRANSCRIPTION_PROVIDER: "mock",
      MOCK_TRANSCRIPTION_DELAY_MS: "0",
      UPLOAD_DIR: path.join(os.tmpdir(), "bm-web-test-uploads"),
      USER_ANALYSES_PER_HOUR: "50",
      AUTH_SECRET: "test-secret",
    },
  },
});
