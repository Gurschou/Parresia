/**
 * Fallback env loader.
 *
 * Next.js only loads .env.local from the app directory (apps/web). A very
 * common mistake is placing the file in the monorepo root — so if no
 * provider key is present, we look for .env.local / .env in the repo root
 * and load simple KEY=VALUE pairs without overwriting existing values.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "MISTRAL_API_KEY",
  "OSS_BASE_URL",
];

export function loadRootEnvFallback(): void {
  if (PROVIDER_KEYS.some((key) => process.env[key])) return;
  const root = join(process.cwd(), "..", "..");
  for (const file of [".env.local", ".env"]) {
    let raw: string;
    try {
      raw = readFileSync(join(root, file), "utf-8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (key && value && !process.env[key]) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
}
