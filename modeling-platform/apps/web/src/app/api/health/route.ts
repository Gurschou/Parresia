import { loadConfig } from "@bm/core";
import { getDb } from "@/db";

/** GET /api/health — liveness + konfigurationsoverblik (uden hemmeligheder). */
export async function GET() {
  const cfg = loadConfig();
  let db = "ok";
  try {
    await getDb();
  } catch {
    db = "error";
  }
  return Response.json(
    {
      status: db === "ok" ? "ok" : "degraded",
      db,
      llm: { provider: cfg.llmProvider, model: cfg.model, apiKeyConfigured: !!cfg.anthropicApiKey },
      transcription: { provider: process.env.TRANSCRIPTION_PROVIDER ?? "openai" },
    },
    { status: db === "ok" ? 200 : 503 },
  );
}
