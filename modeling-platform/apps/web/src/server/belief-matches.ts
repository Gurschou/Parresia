import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildInventory,
  matchBeliefs,
  matchesForPerson,
  toAnalysisError,
  type AnalysisResult,
  type LlmClient,
  type BeliefMatch,
  type MatchSource,
  type PersonRecord,
} from "@bm/core";
import { getDb, schema } from "@/db";
import type { BeliefMatchRunRow } from "@/db/schema";
import { notFound } from "./http";

/**
 * Overbevisnings-match i web-appen. Hver gang en analyse bliver færdig,
 * matches personens overbevisninger mod alle andre personer i brugerens
 * bibliotek — begge veje — og resultatet gemmes, så det kan vises pr. person,
 * pr. analyse og samlet.
 */

export interface PersonRef {
  key: string;
  name: string;
  expertId: string | null;
  isSelf: boolean;
}

export interface Person extends PersonRef {
  role: string;
  analysisIds: string[];
  latestAnalysisId: string;
  latestAt: Date;
}

export type StoredMatch = BeliefMatch & { id: string; runAnalysisId: string; source: MatchSource; createdAt: Date };

export const personKey = (expertId: string | null, name: string) => expertId ?? `anon:${name.trim().toLowerCase()}`;

/** Færdige analyser → hvilken person de tilhører (læses frisk, så ekspert-skift slår igennem). */
export async function personIndex(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.analyses.id,
      createdAt: schema.analyses.createdAt,
      expertId: schema.analyses.expertId,
      expertName: schema.experts.name,
      expertRole: schema.experts.role,
      isSelf: schema.experts.isSelf,
      subject: sql<string | null>`${schema.analyses.result}->'summary'->>'subject'`,
      contextName: sql<string | null>`${schema.analyses.context}->>'subjectName'`,
    })
    .from(schema.analyses)
    .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
    .where(and(eq(schema.analyses.ownerId, userId), eq(schema.analyses.status, "completed")))
    .orderBy(desc(schema.analyses.createdAt));
  const index = new Map<string, PersonRef & { role: string; createdAt: Date }>();
  for (const r of rows) {
    const name = (r.expertName || r.subject || r.contextName || "Ukendt person").trim();
    index.set(r.id, {
      key: personKey(r.expertId, name),
      name,
      expertId: r.expertId,
      isSelf: !!r.isSelf,
      role: r.expertRole ?? "",
      createdAt: r.createdAt,
    });
  }
  return index;
}

export function groupPersons(index: Awaited<ReturnType<typeof personIndex>>): Person[] {
  const persons = new Map<string, Person>();
  for (const [analysisId, p] of index) {
    const cur = persons.get(p.key);
    if (cur) {
      cur.analysisIds.push(analysisId);
      if (p.createdAt > cur.latestAt) Object.assign(cur, { latestAnalysisId: analysisId, latestAt: p.createdAt });
    } else {
      persons.set(p.key, { key: p.key, name: p.name, expertId: p.expertId, isSelf: p.isSelf, role: p.role, analysisIds: [analysisId], latestAnalysisId: analysisId, latestAt: p.createdAt });
    }
  }
  return [...persons.values()].sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || +b.latestAt - +a.latestAt);
}

// ── Kørsel ───────────────────────────────────────────────────────────────────

async function setRun(analysisId: string, ownerId: string, patch: Partial<typeof schema.beliefMatchRuns.$inferInsert>) {
  const db = await getDb();
  await db
    .insert(schema.beliefMatchRuns)
    .values({ analysisId, ownerId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.beliefMatchRuns.analysisId, set: { ...patch, updatedAt: new Date() } });
}

/**
 * Matcher analysens person mod alle andre. Idempotent: en ny kørsel for samme
 * analyse erstatter den forrige.
 */
export async function runBeliefMatch(analysisId: string, signal?: AbortSignal, opts: { llm?: LlmClient } = {}): Promise<void> {
  const db = await getDb();
  const row = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
  if (!row || row.status !== "completed" || !row.result) return;
  const ownerId = row.ownerId;
  await setRun(analysisId, ownerId, { status: "running", note: "" });

  try {
    const rows = await db
      .select({
        id: schema.analyses.id,
        title: schema.analyses.title,
        createdAt: schema.analyses.createdAt,
        result: schema.analyses.result,
        context: schema.analyses.context,
        expertId: schema.analyses.expertId,
        expertName: schema.experts.name,
        expertRole: schema.experts.role,
      })
      .from(schema.analyses)
      .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
      .where(and(eq(schema.analyses.ownerId, ownerId), eq(schema.analyses.status, "completed")))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(400);
    const records: PersonRecord[] = rows
      .filter((r) => r.result)
      .map((r) => {
        const result = r.result as AnalysisResult;
        const name = (r.expertName || result.summary.subject || r.context.subjectName || "Ukendt person").trim();
        return {
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          expertId: r.expertId,
          expertName: name,
          personKey: personKey(r.expertId, name),
          domain: r.expertRole || r.context.domain || "",
          result,
        };
      });
    const target = records.find((r) => r.id === analysisId);
    if (!target) return;
    const inventory = buildInventory(
      { analysisId, records: records.filter((r) => r.personKey === target.personKey) },
      records.filter((r) => r.personKey !== target.personKey),
    );
    const run = await matchBeliefs(inventory, { signal, llm: opts.llm });

    await db.transaction(async (tx) => {
      await tx.delete(schema.beliefMatches).where(eq(schema.beliefMatches.runAnalysisId, analysisId));
      if (run.matches.length) {
        await tx.insert(schema.beliefMatches).values(
          run.matches.map((m) => ({
            ownerId,
            runAnalysisId: analysisId,
            fromAnalysisId: m.from.analysisId,
            toAnalysisId: m.to.analysisId,
            kind: m.kind,
            fit: m.fit,
            beliefKind: m.belief.kind,
            beliefType: m.belief.type,
            statement: m.belief.statement,
            impact: m.belief.impact,
            quote: m.belief.quote,
            anchorType: m.anchor.type,
            anchorText: m.anchor.text,
            rationale: m.rationale,
            bridgeQuestion: m.bridgeQuestion,
            source: run.source,
          })),
        );
      }
    });
    await setRun(analysisId, ownerId, {
      status: "done",
      source: run.source,
      summary: run.summary,
      note: run.meta.fallback_reason ? `Claude kunne ikke svare (${run.meta.fallback_reason}), så matchet er tekstbaseret.` : "",
      personCount: inventory.persons.length - 1,
      model: run.meta.model || null,
    });
  } catch (err) {
    const e = toAnalysisError(err);
    console.error(`[match] analyse ${analysisId} fejlede: ${e.code}`, e.details ?? e.message);
    await setRun(analysisId, ownerId, { status: "failed", note: e.userMessage }).catch(() => {});
  }
}

// ── Læsning ──────────────────────────────────────────────────────────────────

async function storedMatches(userId: string, index: Awaited<ReturnType<typeof personIndex>>, runAnalysisId?: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.beliefMatches)
    .where(
      and(
        eq(schema.beliefMatches.ownerId, userId),
        ...(runAnalysisId ? [eq(schema.beliefMatches.runAnalysisId, runAnalysisId)] : []),
      ),
    )
    .orderBy(desc(schema.beliefMatches.createdAt));
  const out: StoredMatch[] = [];
  for (const r of rows) {
    const from = index.get(r.fromAnalysisId);
    const to = index.get(r.toAnalysisId);
    if (!from || !to || from.key === to.key) continue;
    out.push({
      id: r.id,
      runAnalysisId: r.runAnalysisId,
      source: r.source,
      createdAt: r.createdAt,
      kind: r.kind,
      fit: r.fit,
      from: { personKey: from.key, name: from.name, expertId: from.expertId, analysisId: r.fromAnalysisId },
      to: { personKey: to.key, name: to.name, expertId: to.expertId, analysisId: r.toAnalysisId },
      belief: { kind: r.beliefKind, type: r.beliefType, statement: r.statement, impact: r.impact, quote: r.quote },
      anchor: { type: r.anchorType as BeliefMatch["anchor"]["type"], text: r.anchorText },
      rationale: r.rationale,
      bridgeQuestion: r.bridgeQuestion,
    });
  }
  return out;
}

export type PersonSummary = Person & { incoming: number; outgoing: number; shared: number };

/** Samlet overblik + alle match for én person (default: dig selv, ellers den nyeste). */
export async function getBeliefMatchView(userId: string, selectedKey?: string) {
  const index = await personIndex(userId);
  const persons = groupPersons(index);
  const all = await storedMatches(userId, index);
  const summaries: PersonSummary[] = persons.map((p) => {
    const g = matchesForPerson(all, p.key);
    return { ...p, incoming: g.incoming.length, outgoing: g.outgoing.length, shared: g.shared.length };
  });
  const selected = summaries.find((p) => p.key === selectedKey) ?? summaries.find((p) => p.isSelf) ?? summaries[0] ?? null;
  const grouped = selected ? matchesForPerson(all, selected.key) : { incoming: [], outgoing: [], shared: [] };

  const db = await getDb();
  const runs = await db.query.beliefMatchRuns.findMany({ where: eq(schema.beliefMatchRuns.ownerId, userId) });
  const latestRun = selected
    ? runs
        .filter((r) => selected.analysisIds.includes(r.analysisId) && r.status === "done")
        .sort((a, b) => +b.updatedAt - +a.updatedAt)[0] ?? null
    : null;
  const active = runs.filter((r) => r.status === "pending" || r.status === "running").length;
  const missing = [...index.keys()].filter((id) => !runs.some((r) => r.analysisId === id)).length;

  return { persons: summaries, selected, ...grouped, latestRun, activeRuns: active, unmatchedAnalyses: missing, total: all.length };
}
export type BeliefMatchView = Awaited<ReturnType<typeof getBeliefMatchView>>;

/** Match fra én analyses kørsel, set fra analysens person. */
export async function getAnalysisMatches(userId: string, analysisId: string) {
  const db = await getDb();
  const analysis = await db.query.analyses.findFirst({
    where: and(eq(schema.analyses.id, analysisId), eq(schema.analyses.ownerId, userId)),
    columns: { id: true, status: true },
  });
  if (!analysis) throw notFound("Analysen");
  const run: BeliefMatchRunRow | null =
    (await db.query.beliefMatchRuns.findFirst({ where: eq(schema.beliefMatchRuns.analysisId, analysisId) })) ?? null;
  const index = await personIndex(userId);
  const me = index.get(analysisId);
  const matches = run?.status === "done" ? await storedMatches(userId, index, analysisId) : [];
  const grouped = me ? matchesForPerson(matches, me.key) : { incoming: [], outgoing: [], shared: [] };
  return {
    analysisStatus: analysis.status,
    run: run && { status: run.status, source: run.source, summary: run.summary, note: run.note, personCount: run.personCount, updatedAt: run.updatedAt },
    person: me ? { key: me.key, name: me.name, isSelf: me.isSelf } : null,
    ...grouped,
  };
}
export type AnalysisMatches = Awaited<ReturnType<typeof getAnalysisMatches>>;

/** Analyser, der mangler en match-kørsel (fx data fra før funktionen fandtes). */
export async function analysesWithoutRun(userId?: string): Promise<{ id: string; ownerId: string }[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.analyses.id, ownerId: schema.analyses.ownerId, run: schema.beliefMatchRuns.analysisId, status: schema.beliefMatchRuns.status })
    .from(schema.analyses)
    .leftJoin(schema.beliefMatchRuns, eq(schema.beliefMatchRuns.analysisId, schema.analyses.id))
    .where(and(eq(schema.analyses.status, "completed"), ...(userId ? [eq(schema.analyses.ownerId, userId)] : [])))
    .orderBy(schema.analyses.createdAt);
  return rows.filter((r) => !r.run || r.status === "pending" || r.status === "running").map(({ id, ownerId }) => ({ id, ownerId }));
}

/** Markér kørsler som ventende (før de lægges i køen). */
export async function markPending(ids: { id: string; ownerId: string }[]) {
  for (const { id, ownerId } of ids) await setRun(id, ownerId, { status: "pending", note: "" });
}

export async function ownedCompletedAnalysis(userId: string, analysisId: string) {
  const db = await getDb();
  const row = await db.query.analyses.findFirst({
    where: and(eq(schema.analyses.id, analysisId), eq(schema.analyses.ownerId, userId), inArray(schema.analyses.status, ["completed"])),
    columns: { id: true, ownerId: true },
  });
  if (!row) throw notFound("Den færdige analyse");
  return row;
}
