import { rm } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { AnalysisError, analyzeTranscript, toAnalysisError, type AnalysisProgress } from "@bm/core";
import { getDb, schema } from "@/db";
import { analysesWithoutRun, markPending, runBeliefMatch } from "./belief-matches";

/**
 * In-process job-kø til analyser (transskribering + Claude).
 *
 * Status og fremdrift skrives løbende til `analyses`, så UI og API kan
 * polle. Kræver en Node-server, der kører hele tiden (`next start`/Docker),
 * ikke serverless. Ved genstart genoptages ufærdige jobs (instrumentation.ts).
 */

type Update = Partial<typeof schema.analyses.$inferInsert>;

const g = globalThis as typeof globalThis & { __bmJobs?: Map<string, AbortController>; __bmMatchJobs?: Map<string, Promise<void>> };
const running = (g.__bmJobs ??= new Map());
const matching = (g.__bmMatchJobs ??= new Map());

async function update(id: string, patch: Update) {
  const db = await getDb();
  await db
    .update(schema.analyses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.analyses.id, id));
}

/** Throttler fremdrifts-opdateringer, så DB'en ikke hamres under streaming. */
function throttled(id: string, intervalMs = 700) {
  let last = 0;
  let pendingPatch: Update | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    timer = null;
    if (!pendingPatch) return;
    const p = pendingPatch;
    pendingPatch = null;
    last = Date.now();
    await update(id, p).catch(() => {});
  };
  return {
    push(patch: Update) {
      pendingPatch = { ...pendingPatch, ...patch };
      const wait = intervalMs - (Date.now() - last);
      if (wait <= 0) void flush();
      else timer ??= setTimeout(() => void flush(), wait);
    },
    async done() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingPatch = null;
    },
  };
}

const ANALYSIS_PROGRESS: Record<AnalysisProgress["stage"], number> = {
  preparing: 40,
  queued: 42,
  analyzing: 48,
  receiving: 55,
  validating: 92,
  repairing: 60,
  done: 98,
};

export async function runAnalysisJob(id: string, signal?: AbortSignal): Promise<void> {
  const db = await getDb();
  const row = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, id) });
  if (!row || row.status === "completed") return;
  const ticker = throttled(id);

  try {
    let transcript = row.transcript;

    // 1) Lyd/video → tekst
    if (!transcript.trim() && row.uploadPath) {
      await update(id, { status: "transcribing", progress: 5, stageMessage: "Forbereder transskribering", errorCode: null, errorMessage: null });
      const { transcribeMedia } = await import("@bm/core/transcription");
      const res = await transcribeMedia(row.uploadPath, {
        signal,
        workDir: process.env.UPLOAD_DIR,
        onProgress: (p) =>
          ticker.push({
            stageMessage: p.message,
            progress: p.chunks ? 10 + Math.round((25 * (p.chunk ?? 1)) / p.chunks) : p.stage === "done" ? 35 : 10,
          }),
      });
      await ticker.done();
      transcript = res.text;
      await update(id, {
        transcript,
        progress: 38,
        stageMessage: "Transskribering færdig",
        mediaInfo: { provider: res.provider, durationSec: res.durationSec, chunks: res.chunks, language: res.language },
        uploadPath: null,
      });
      await rm(row.uploadPath, { force: true }).catch(() => {});
    }

    // 2) Transskript → adfærdsmodel
    await update(id, { status: "analyzing", progress: 40, stageMessage: "Starter analysen", errorCode: null, errorMessage: null });
    const expert = row.expertId ? await db.query.experts.findFirst({ where: eq(schema.experts.id, row.expertId) }) : undefined;
    const envelope = await analyzeTranscript(
      {
        transcript,
        context: {
          ...row.context,
          subjectName: row.context.subjectName || expert?.name,
          domain: row.context.domain || expert?.role || undefined,
        },
      },
      {
        signal,
        onProgress: (p) => {
          let pct = ANALYSIS_PROGRESS[p.stage];
          // Under streaming: 55 → 90 % baseret på modtagne tegn (typisk 20-60k tegn).
          if (p.stage === "receiving" && p.receivedChars) pct = 55 + Math.min(35, Math.round((p.receivedChars / 45000) * 35));
          ticker.push({ stageMessage: p.message, progress: pct });
        },
      },
    );
    await ticker.done();
    // Standardtitlen ("Analyse 17.11.2026") erstattes af den modellerede person.
    const autoTitle = /^Analyse \d/.test(row.title) && envelope.result.summary.subject && envelope.result.summary.subject !== "Ukendt person";
    await update(id, {
      ...(autoTitle ? { title: [envelope.result.summary.subject, row.sourceName].filter(Boolean).join(" · ") } : {}),
      status: "completed",
      progress: 100,
      stageMessage: "Færdig",
      result: envelope.result,
      meta: envelope.meta,
      schemaVersion: envelope.schema_version,
      model: envelope.meta.model,
      inputTokens: envelope.meta.input_tokens,
      outputTokens: envelope.meta.output_tokens,
      completedAt: new Date(),
    });
    // 3) Overbevisnings-match mod alle andre personer (kører videre i baggrunden).
    enqueueBeliefMatch(id, row.ownerId);
  } catch (err) {
    await ticker.done();
    const e = err instanceof AnalysisError ? err : toAnalysisError(err);
    console.error(`[jobs] analyse ${id} fejlede: ${e.code}`, e.details ?? e.message);
    await update(id, {
      status: "failed",
      stageMessage: "Fejlede",
      errorCode: e.code,
      errorMessage: e.details ? `${e.userMessage} (${e.details})` : e.userMessage,
    }).catch(() => {});
  }
}

/** Starter et job i baggrunden (idempotent pr. analyse-id). */
export function enqueueAnalysis(id: string): void {
  if (running.has(id)) return;
  const ctrl = new AbortController();
  running.set(id, ctrl);
  void runAnalysisJob(id, ctrl.signal).finally(() => running.delete(id));
}

export function cancelAnalysis(id: string): void {
  running.get(id)?.abort();
  running.delete(id);
}

export function isRunning(id: string): boolean {
  return running.has(id);
}

/**
 * Lægger et overbevisnings-match i kø for en færdig analyse. Kørsler for samme
 * bruger kører én ad gangen (hver kørsel læser hele biblioteket), og en ny
 * anmodning for en analyse, der allerede kører, ignoreres.
 */
export function enqueueBeliefMatch(id: string, ownerId: string): Promise<void> {
  const existing = matching.get(id);
  if (existing) return existing;
  const userKey = `user:${ownerId}`;
  const previous = matching.get(userKey) ?? Promise.resolve();
  const job = (async () => {
    await markPending([{ id, ownerId }]).catch(() => {});
    await previous.catch(() => {});
    await runBeliefMatch(id);
  })().finally(() => {
    matching.delete(id);
    if (matching.get(userKey) === job) matching.delete(userKey);
  });
  matching.set(id, job);
  matching.set(userKey, job);
  return job;
}

export function isMatching(id: string): boolean {
  return matching.has(id);
}

/** Match alle færdige analyser, der endnu ikke er matchet (fx fra før funktionen fandtes). */
export async function backfillBeliefMatches(userId: string): Promise<number> {
  const missing = await analysesWithoutRun(userId);
  for (const a of missing) void enqueueBeliefMatch(a.id, a.ownerId);
  return missing.length;
}

/** Kaldes ved serverstart: genoptag jobs, der blev afbrudt af en genstart. */
export async function resumePendingJobs(): Promise<number> {
  const db = await getDb();
  const stuck = await db
    .select({ id: schema.analyses.id })
    .from(schema.analyses)
    .where(inArray(schema.analyses.status, ["queued", "transcribing", "analyzing"]));
  for (const { id } of stuck) enqueueAnalysis(id);
  // Match-kørsler, der var i gang eller i kø, da serveren stoppede.
  const interrupted = await db
    .select({ id: schema.beliefMatchRuns.analysisId, ownerId: schema.beliefMatchRuns.ownerId })
    .from(schema.beliefMatchRuns)
    .where(inArray(schema.beliefMatchRuns.status, ["pending", "running"]));
  for (const r of interrupted) void enqueueBeliefMatch(r.id, r.ownerId);
  return stuck.length + interrupted.length;
}
