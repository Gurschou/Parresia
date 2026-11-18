import { and, desc, eq, inArray } from "drizzle-orm";
import {
  buildModelingSource,
  modelPerson,
  toAnalysisError,
  type AnalysisResult,
  type HumanNeedKey,
  type LlmClient,
  type SessionInput,
} from "@bm/core";
import { getDb, schema } from "@/db";
import type { ModelingMapRow } from "@/db/schema";
import { notFound } from "./http";
import { groupPersons, personIndex, personKey, type Person } from "./belief-matches";

/**
 * Gustavs modellering i web-appen. Når en analyse er færdig, modelleres
 * personen igen ud fra ALLE personens samtaler (den nye først), og kortet
 * gemmes på analysen. Det nyeste færdige kort er personens aktuelle model.
 */

async function setMap(analysisId: string, ownerId: string, patch: Partial<typeof schema.modelingMaps.$inferInsert>) {
  const db = await getDb();
  await db
    .insert(schema.modelingMaps)
    .values({ analysisId, ownerId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.modelingMaps.analysisId, set: { ...patch, updatedAt: new Date() } });
}

type Row = {
  id: string;
  title: string;
  transcript: string;
  createdAt: Date;
  sessionDate: string | null;
  result: AnalysisResult | null;
  context: { subjectName?: string; domain?: string; goal?: string };
  expertId: string | null;
  expertName: string | null;
  expertRole: string | null;
  isSelf: boolean | null;
};

const nameOf = (r: Row) => (r.expertName || r.result?.summary.subject || r.context.subjectName || "Ukendt person").trim();
const asSession = (r: Row): SessionInput => ({
  analysisId: r.id,
  title: r.title,
  date: r.sessionDate ?? r.createdAt,
  transcript: r.transcript,
  result: r.result,
});

export async function runModeling(analysisId: string, signal?: AbortSignal, opts: { llm?: LlmClient } = {}): Promise<void> {
  const db = await getDb();
  const row = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
  if (!row || row.status !== "completed" || !row.result) return;
  const ownerId = row.ownerId;
  await setMap(analysisId, ownerId, { status: "running", note: "" });

  try {
    const rows: Row[] = await db
      .select({
        id: schema.analyses.id,
        title: schema.analyses.title,
        transcript: schema.analyses.transcript,
        createdAt: schema.analyses.createdAt,
        sessionDate: schema.analyses.sessionDate,
        result: schema.analyses.result,
        context: schema.analyses.context,
        expertId: schema.analyses.expertId,
        expertName: schema.experts.name,
        expertRole: schema.experts.role,
        isSelf: schema.experts.isSelf,
      })
      .from(schema.analyses)
      .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
      .where(and(eq(schema.analyses.ownerId, ownerId), eq(schema.analyses.status, "completed")))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(400);
    const target = rows.find((r) => r.id === analysisId);
    if (!target) return;
    const key = personKey(target.expertId, nameOf(target));
    const mine = rows.filter((r) => r.result && personKey(r.expertId, nameOf(r)) === key);
    const others = mine.filter((r) => r.id !== analysisId);

    // Brugerens egen profil (til installationsplanens modstand), når personen er en anden.
    const selfRows = target.isSelf ? [] : rows.filter((r) => r.isSelf && r.result);
    const installer = selfRows.length
      ? {
          name: selfRows[0]!.expertName ?? "Dig",
          disenabling: [...new Set(selfRows.flatMap((r) => r.result!.disenabling_beliefs.beliefs.map((b) => b.statement)))].slice(0, 6),
          dominant_needs: selfRows[0]!.result!.values_and_6_human_needs.dominant_needs as HumanNeedKey[],
        }
      : null;

    const source = buildModelingSource({
      person: {
        name: nameOf(target),
        domain: target.expertRole || target.context.domain || "",
        goal: target.context.goal || "",
        isSelf: !!target.isSelf,
      },
      target: asSession(target),
      others: others.map(asSession),
      installer,
    });
    const run = await modelPerson(source, { signal, llm: opts.llm });
    await setMap(analysisId, ownerId, {
      status: "done",
      source: run.source,
      result: run.result,
      note: run.meta.fallback_reason ? `Claude kunne ikke svare (${run.meta.fallback_reason}), så kortet er tekstbaseret.` : "",
      model: run.meta.model || null,
      precision: run.result.audit.precision,
      sessionCount: run.result.sessions.length,
      inputTokens: run.meta.input_tokens,
      outputTokens: run.meta.output_tokens,
    });
  } catch (err) {
    const e = toAnalysisError(err);
    console.error(`[modeling] analyse ${analysisId} fejlede: ${e.code}`, e.details ?? e.message);
    await setMap(analysisId, ownerId, { status: "failed", note: e.userMessage }).catch(() => {});
  }
}

// ── Læsning ──────────────────────────────────────────────────────────────────

export type StoredModelingMap = Pick<
  ModelingMapRow,
  "analysisId" | "status" | "source" | "result" | "note" | "model" | "precision" | "sessionCount" | "updatedAt"
>;

export type ModelingPerson = Person & { latestMap: StoredModelingMap | null; mapCount: number; active: boolean };

/** Personer + det aktuelle kort for den valgte (default: dig selv, ellers den nyeste). */
export async function getModelingView(userId: string, selectedKey?: string, analysisId?: string) {
  const index = await personIndex(userId);
  const persons = groupPersons(index);
  const db = await getDb();
  const maps = await db
    .select({
      analysisId: schema.modelingMaps.analysisId,
      status: schema.modelingMaps.status,
      source: schema.modelingMaps.source,
      result: schema.modelingMaps.result,
      note: schema.modelingMaps.note,
      model: schema.modelingMaps.model,
      precision: schema.modelingMaps.precision,
      sessionCount: schema.modelingMaps.sessionCount,
      updatedAt: schema.modelingMaps.updatedAt,
    })
    .from(schema.modelingMaps)
    .where(eq(schema.modelingMaps.ownerId, userId))
    .orderBy(desc(schema.modelingMaps.updatedAt));

  const summaries: ModelingPerson[] = persons.map((p) => {
    const own = maps.filter((m) => p.analysisIds.includes(m.analysisId));
    return {
      ...p,
      latestMap: own.find((m) => m.status === "done") ?? null,
      mapCount: own.filter((m) => m.status === "done").length,
      active: own.some((m) => m.status === "pending" || m.status === "running"),
    };
  });
  const byAnalysis = analysisId ? summaries.find((p) => p.analysisIds.includes(analysisId)) : undefined;
  const selected = byAnalysis ?? summaries.find((p) => p.key === selectedKey) ?? summaries.find((p) => p.isSelf) ?? summaries[0] ?? null;
  const history = selected ? maps.filter((m) => selected.analysisIds.includes(m.analysisId) && m.status === "done") : [];
  const shown = (analysisId ? history.find((m) => m.analysisId === analysisId) : undefined) ?? history[0] ?? null;
  const active = maps.filter((m) => m.status === "pending" || m.status === "running").length;
  const missing = [...index.keys()].filter((id) => !maps.some((m) => m.analysisId === id)).length;
  return {
    persons: summaries,
    selected,
    map: shown,
    history: history.map(({ analysisId, precision, sessionCount, updatedAt, source }) => ({ analysisId, precision, sessionCount, updatedAt, source })),
    activeRuns: active,
    unmodeledAnalyses: missing,
  };
}
export type ModelingView = Awaited<ReturnType<typeof getModelingView>>;

/** Kortet for én analyse (til rapportsiden). */
export async function getAnalysisModeling(userId: string, analysisId: string) {
  const db = await getDb();
  const analysis = await db.query.analyses.findFirst({
    where: and(eq(schema.analyses.id, analysisId), eq(schema.analyses.ownerId, userId)),
    columns: { id: true, status: true },
  });
  if (!analysis) throw notFound("Analysen");
  const map = (await db.query.modelingMaps.findFirst({ where: eq(schema.modelingMaps.analysisId, analysisId) })) ?? null;
  const index = await personIndex(userId);
  const me = index.get(analysisId);
  return {
    analysisStatus: analysis.status,
    person: me ? { key: me.key, name: me.name, isSelf: me.isSelf } : null,
    map: map && {
      analysisId: map.analysisId,
      status: map.status,
      source: map.source,
      result: map.result,
      note: map.note,
      model: map.model,
      precision: map.precision,
      sessionCount: map.sessionCount,
      updatedAt: map.updatedAt,
    },
  };
}
export type AnalysisModeling = Awaited<ReturnType<typeof getAnalysisModeling>>;

/** Færdige analyser uden (færdigt) modelleringskort. */
export async function analysesWithoutMap(userId?: string): Promise<{ id: string; ownerId: string }[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.analyses.id, ownerId: schema.analyses.ownerId, map: schema.modelingMaps.analysisId, status: schema.modelingMaps.status })
    .from(schema.analyses)
    .leftJoin(schema.modelingMaps, eq(schema.modelingMaps.analysisId, schema.analyses.id))
    .where(and(eq(schema.analyses.status, "completed"), ...(userId ? [eq(schema.analyses.ownerId, userId)] : [])))
    .orderBy(schema.analyses.createdAt);
  return rows.filter((r) => !r.map || r.status === "pending" || r.status === "running").map(({ id, ownerId }) => ({ id, ownerId }));
}

/** Den nyeste færdige analyse pr. person, der mangler et kort (backfill: ét kort pr. person er nok). */
export async function latestAnalysesWithoutMap(userId: string): Promise<{ id: string; ownerId: string }[]> {
  const missing = new Set((await analysesWithoutMap(userId)).map((r) => r.id));
  const persons = groupPersons(await personIndex(userId));
  const db = await getDb();
  const done = await db
    .select({ analysisId: schema.modelingMaps.analysisId })
    .from(schema.modelingMaps)
    .where(and(eq(schema.modelingMaps.ownerId, userId), eq(schema.modelingMaps.status, "done")));
  const hasMap = new Set(done.map((d) => d.analysisId));
  return persons
    .filter((p) => !p.analysisIds.some((id) => hasMap.has(id)) && missing.has(p.latestAnalysisId))
    .map((p) => ({ id: p.latestAnalysisId, ownerId: userId }));
}

export async function markModelingPending(ids: { id: string; ownerId: string }[]) {
  for (const { id, ownerId } of ids) await setMap(id, ownerId, { status: "pending", note: "" });
}

export async function interruptedModeling(): Promise<{ id: string; ownerId: string }[]> {
  const db = await getDb();
  return db
    .select({ id: schema.modelingMaps.analysisId, ownerId: schema.modelingMaps.ownerId })
    .from(schema.modelingMaps)
    .where(inArray(schema.modelingMaps.status, ["pending", "running"]));
}
