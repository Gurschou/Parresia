import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);

/**
 * E2E mod produktionsbuildet (`next build` køres af `pnpm e2e`), i mock-mode
 * med en frisk in-memory database pr. kørsel — ingen API-nøgler nødvendige.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: `next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "memory://",
      LLM_PROVIDER: "mock",
      MOCK_DELAY_MS: "1500",
      TRANSCRIPTION_PROVIDER: "mock",
      MOCK_TRANSCRIPTION_DELAY_MS: "800",
      AUTH_SECRET: "e2e-secret-not-for-production",
      AUTH_TRUST_HOST: "true",
      UPLOAD_DIR: "./data/e2e-uploads",
    },
  },
});
