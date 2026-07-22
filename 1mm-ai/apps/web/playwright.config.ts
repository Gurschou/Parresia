import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build with the deterministic mock AI
 * provider (MOCK_AI=1) – never against the real OpenAI API.
 * Requirements: a running PostgreSQL with migrations applied (see README).
 */
const PORT = process.env.E2E_PORT ?? "3100";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/onemm_ai";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-at-least-16-chars",
      MOCK_AI: "1",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    },
  },
});
