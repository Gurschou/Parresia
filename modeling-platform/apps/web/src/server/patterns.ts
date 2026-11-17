import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CATEGORIES, suggestPatterns, type AnalysisRecord } from "@bm/core";
import { getDb, schema } from "@/db";
import { HttpError, notFound } from "./http";
import { getCompletedAnalyses } from "./analyses";

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [string, ...string[]];

const Excerpt = z.object({
  label: z.string().trim().min(1).max(2000),
  detail: z.string().trim().max(4000).optional(),
  quotes: z.array(z.string().max(2000)).max(10).optional(),
});

const ExampleInput = z.object({ analysisId: z.string().min(1), excerpt: Excerpt });

export const PatternInputSchema = z.object({
  title: z.string().trim().min(2, "Titel er påkrævet").max(200),
  category: z.enum(CATEGORY_KEYS),
  description: z.string().trim().max(4000).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  examples: z.array(ExampleInput).max(50).optional().default([]),
});

async function assertAnalyses(userId: string, ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.analyses.id })
    .from(schema.analyses)
    .where(and(eq(schema.analyses.ownerId, userId), inArray(schema.analyses.id, [...new Set(ids)])));
  if (rows.length !== new Set(ids).size) throw new HttpError(422, "invalid_analysis", "En eller flere analyser findes ikke.");
}

export async function listPatterns(userId: string) {
  const db = await getDb();
  const patterns = await db.query.patterns.findMany({
    where: eq(schema.patterns.ownerId, userId),
    orderBy: desc(schema.patterns.updatedAt),
  });
  if (!patterns.length) return [];
  const examples = await db
    .select({
      id: schema.patternExamples.id,
      patternId: schema.patternExamples.patternId,
      analysisId: schema.patternExamples.analysisId,
      excerpt: schema.patternExamples.excerpt,
      analysisTitle: schema.analyses.title,
      expertId: schema.analyses.expertId,
      expertName: schema.experts.name,
    })
    .from(schema.patternExamples)
    .innerJoin(schema.analyses, eq(schema.analyses.id, schema.patternExamples.analysisId))
    .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
    .where(inArray(schema.patternExamples.patternId, patterns.map((p) => p.id)));
  return patterns.map((p) => {
    const ex = examples.filter((e) => e.patternId === p.id);
    return { ...p, examples: ex, expertCount: new Set(ex.map((e) => e.expertId ?? e.analysisId)).size };
  });
}
export type PatternWithExamples = Awaited<ReturnType<typeof listPatterns>>[number];

export async function createPattern(userId: string, raw: unknown) {
  const input = PatternInputSchema.parse(raw);
  await assertAnalyses(userId, input.examples.map((e) => e.analysisId));
  const db = await getDb();
  const [p] = await db
    .insert(schema.patterns)
    .values({ ownerId: userId, title: input.title, category: input.category, description: input.description, tags: input.tags })
    .returning();
  if (input.examples.length) {
    await db.insert(schema.patternExamples).values(input.examples.map((e) => ({ patternId: p!.id, analysisId: e.analysisId, excerpt: e.excerpt })));
  }
  return p!;
}

async function ownPattern(userId: string, id: string) {
  const db = await getDb();
  const p = await db.query.patterns.findFirst({ where: and(eq(schema.patterns.id, id), eq(schema.patterns.ownerId, userId)) });
  if (!p) throw notFound("Mønstret");
  return p;
}

export async function addPatternExample(userId: string, patternId: string, raw: unknown) {
  await ownPattern(userId, patternId);
  const input = ExampleInput.parse(raw);
  await assertAnalyses(userId, [input.analysisId]);
  const db = await getDb();
  const [ex] = await db.insert(schema.patternExamples).values({ patternId, analysisId: input.analysisId, excerpt: input.excerpt }).returning();
  await db.update(schema.patterns).set({ updatedAt: new Date() }).where(eq(schema.patterns.id, patternId));
  return ex!;
}

export async function updatePattern(userId: string, id: string, raw: unknown) {
  await ownPattern(userId, id);
  const input = PatternInputSchema.omit({ examples: true }).partial().parse(raw);
  const db = await getDb();
  const [p] = await db.update(schema.patterns).set({ ...input, updatedAt: new Date() }).where(eq(schema.patterns.id, id)).returning();
  return p!;
}

export async function deletePattern(userId: string, id: string) {
  await ownPattern(userId, id);
  const db = await getDb();
  await db.delete(schema.patterns).where(eq(schema.patterns.id, id));
}

export async function removePatternExample(userId: string, patternId: string, exampleId: string) {
  await ownPattern(userId, patternId);
  const db = await getDb();
  await db
    .delete(schema.patternExamples)
    .where(and(eq(schema.patternExamples.id, exampleId), eq(schema.patternExamples.patternId, patternId)));
}

/** Automatiske forslag til fælles mønstre på tværs af brugerens eksperter. */
export async function getPatternSuggestions(userId: string, opts: { projectId?: string; minExperts?: number } = {}) {
  const rows = await getCompletedAnalyses(userId, { projectId: opts.projectId });
  const records: AnalysisRecord[] = rows.filter((r) => r.result).map((r) => ({ ...r, result: r.result! }));
  return suggestPatterns(records, { minExperts: opts.minExperts ?? 2 });
}
