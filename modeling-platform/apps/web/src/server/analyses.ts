import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Analysis } from "@/db/schema";
import { HttpError, notFound } from "./http";
import { cancelAnalysis, enqueueAnalysis } from "./jobs";
import { assertWithinQuota } from "./quota";
import { consumeUpload } from "./uploads";

const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const CreateAnalysisSchema = z
  .object({
    title: z.string().trim().max(200).optional().default(""),
    transcript: z.string().optional().default(""),
    uploadId: z.string().trim().optional(),
    sourceName: z.string().trim().max(300).optional().default(""),
    expertId: optionalId,
    projectId: optionalId,
    sessionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Datoformat: ÅÅÅÅ-MM-DD")
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    context: z
      .object({
        subjectName: z.string().trim().max(120).optional(),
        domain: z.string().trim().max(200).optional(),
        goal: z.string().trim().max(500).optional(),
        interviewer: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .optional()
      .default({}),
  })
  .refine((d) => d.transcript.trim().length > 0 || !!d.uploadId, {
    message: "Angiv enten et transskript eller en uploadet lyd/video-fil.",
    path: ["transcript"],
  });

export type CreateAnalysisInput = z.input<typeof CreateAnalysisSchema>;

async function assertOwned(userId: string, expertId: string | null, projectId: string | null) {
  const db = await getDb();
  if (expertId) {
    const e = await db.query.experts.findFirst({ where: and(eq(schema.experts.id, expertId), eq(schema.experts.ownerId, userId)) });
    if (!e) throw new HttpError(422, "invalid_expert", "Eksperten findes ikke.");
  }
  if (projectId) {
    const p = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, userId)) });
    if (!p) throw new HttpError(422, "invalid_project", "Projektet findes ikke.");
  }
}

export async function createAnalysis(userId: string, raw: CreateAnalysisInput): Promise<Analysis> {
  const input = CreateAnalysisSchema.parse(raw);
  await assertOwned(userId, input.expertId, input.projectId);
  await assertWithinQuota(userId);

  let uploadPath: string | null = null;
  let sourceType: Analysis["sourceType"] = input.sourceName ? "file" : "text";
  let sourceName = input.sourceName;
  if (input.uploadId) {
    const upload = await consumeUpload(userId, input.uploadId);
    uploadPath = upload.path;
    sourceType = upload.kind;
    sourceName = upload.originalName;
  }

  const db = await getDb();
  let expertName: string | undefined;
  if (input.expertId) {
    expertName = (await db.query.experts.findFirst({ where: eq(schema.experts.id, input.expertId) }))?.name;
  }
  const title =
    input.title ||
    [expertName ?? input.context.subjectName, sourceName || null].filter(Boolean).join(" · ") ||
    `Analyse ${new Date().toLocaleDateString("da-DK")}`;

  const [row] = await db
    .insert(schema.analyses)
    .values({
      ownerId: userId,
      expertId: input.expertId,
      projectId: input.projectId,
      title,
      sourceType,
      sourceName,
      transcript: input.transcript.trim(),
      context: input.context,
      uploadPath,
      sessionDate: input.sessionDate ?? null,
      status: "queued",
      stageMessage: uploadPath ? "I kø til transskribering" : "I kø til analyse",
    })
    .returning();
  enqueueAnalysis(row!.id);
  return row!;
}

export interface AnalysisFilters {
  expertId?: string;
  projectId?: string;
  status?: Analysis["status"];
  ids?: string[];
  limit?: number;
}

/** Let liste (uden transskript/resultat). */
export async function listAnalyses(userId: string, f: AnalysisFilters = {}) {
  const db = await getDb();
  const where: SQL[] = [eq(schema.analyses.ownerId, userId)];
  if (f.expertId) where.push(eq(schema.analyses.expertId, f.expertId));
  if (f.projectId) where.push(eq(schema.analyses.projectId, f.projectId));
  if (f.status) where.push(eq(schema.analyses.status, f.status));
  if (f.ids?.length) where.push(inArray(schema.analyses.id, f.ids));
  return db
    .select({
      id: schema.analyses.id,
      title: schema.analyses.title,
      status: schema.analyses.status,
      progress: schema.analyses.progress,
      stageMessage: schema.analyses.stageMessage,
      sourceType: schema.analyses.sourceType,
      sourceName: schema.analyses.sourceName,
      sessionDate: schema.analyses.sessionDate,
      createdAt: schema.analyses.createdAt,
      completedAt: schema.analyses.completedAt,
      model: schema.analyses.model,
      errorMessage: schema.analyses.errorMessage,
      expertId: schema.analyses.expertId,
      expertName: schema.experts.name,
      projectId: schema.analyses.projectId,
      projectName: schema.projects.name,
    })
    .from(schema.analyses)
    .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.analyses.projectId))
    .where(and(...where))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(f.limit ?? 200);
}
export type AnalysisListItem = Awaited<ReturnType<typeof listAnalyses>>[number];

export async function getAnalysis(userId: string, id: string) {
  const db = await getDb();
  const row = await db.query.analyses.findFirst({
    where: and(eq(schema.analyses.id, id), eq(schema.analyses.ownerId, userId)),
  });
  if (!row) throw notFound("Analysen");
  const [expert, project] = await Promise.all([
    row.expertId ? db.query.experts.findFirst({ where: eq(schema.experts.id, row.expertId) }) : undefined,
    row.projectId ? db.query.projects.findFirst({ where: eq(schema.projects.id, row.projectId) }) : undefined,
  ]);
  return { ...row, expert: expert ?? null, project: project ?? null };
}
export type AnalysisDetail = Awaited<ReturnType<typeof getAnalysis>>;

/** Fuldt resultat for flere analyser (sammenligning/dashboard). */
export async function getCompletedAnalyses(userId: string, f: AnalysisFilters = {}) {
  const db = await getDb();
  const where: SQL[] = [eq(schema.analyses.ownerId, userId), eq(schema.analyses.status, "completed")];
  if (f.expertId) where.push(eq(schema.analyses.expertId, f.expertId));
  if (f.projectId) where.push(eq(schema.analyses.projectId, f.projectId));
  if (f.ids?.length) where.push(inArray(schema.analyses.id, f.ids));
  return db
    .select({
      id: schema.analyses.id,
      title: schema.analyses.title,
      createdAt: schema.analyses.createdAt,
      sessionDate: schema.analyses.sessionDate,
      result: schema.analyses.result,
      expertId: schema.analyses.expertId,
      expertName: schema.experts.name,
      projectId: schema.analyses.projectId,
    })
    .from(schema.analyses)
    .leftJoin(schema.experts, eq(schema.experts.id, schema.analyses.expertId))
    .where(and(...where))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(f.limit ?? 500);
}

export async function deleteAnalysis(userId: string, id: string) {
  const db = await getDb();
  const row = await getAnalysis(userId, id);
  cancelAnalysis(id);
  await db.delete(schema.analyses).where(eq(schema.analyses.id, row.id));
}

export async function retryAnalysis(userId: string, id: string) {
  const row = await getAnalysis(userId, id);
  if (row.status !== "failed") throw new HttpError(409, "not_failed", "Kun fejlede analyser kan køres igen.");
  if (!row.transcript.trim() && !row.uploadPath) throw new HttpError(409, "no_source", "Analysen har intet transskript at køre igen.");
  const db = await getDb();
  await db
    .update(schema.analyses)
    .set({ status: "queued", progress: 0, stageMessage: "I kø", errorCode: null, errorMessage: null, updatedAt: new Date() })
    .where(eq(schema.analyses.id, id));
  enqueueAnalysis(id);
}

export const UpdateAnalysisSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  expertId: optionalId,
  projectId: optionalId,
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function updateAnalysis(userId: string, id: string, raw: unknown) {
  const input = UpdateAnalysisSchema.parse(raw);
  await getAnalysis(userId, id);
  await assertOwned(userId, input.expertId ?? null, input.projectId ?? null);
  const db = await getDb();
  const patch: Partial<typeof schema.analyses.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if ((raw as Record<string, unknown>).expertId !== undefined) patch.expertId = input.expertId;
  if ((raw as Record<string, unknown>).projectId !== undefined) patch.projectId = input.projectId;
  if (input.sessionDate !== undefined) patch.sessionDate = input.sessionDate;
  await db.update(schema.analyses).set(patch).where(eq(schema.analyses.id, id));
  return getAnalysis(userId, id);
}
