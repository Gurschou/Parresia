import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    env: { LLM_PROVIDER: "mock", MOCK_DELAY_MS: "0", TRANSCRIPTION_PROVIDER: "mock", MOCK_TRANSCRIPTION_DELAY_MS: "0" },
  },
});
