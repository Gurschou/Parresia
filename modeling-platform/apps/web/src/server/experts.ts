import { and, asc, count, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { HttpError, notFound } from "./http";

export const ExpertInputSchema = z.object({
  name: z.string().trim().min(1, "Navn er påkrævet").max(120),
  role: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  projectId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(1, "Navn er påkrævet").max(120),
  description: z.string().trim().max(2000).optional().default(""),
});

async function assertProject(userId: string, projectId: string | null) {
  if (!projectId) return;
  const db = await getDb();
  const p = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, userId)) });
  if (!p) throw new HttpError(422, "invalid_project", "Projektet findes ikke.");
}

export async function listExperts(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.experts.id,
      name: schema.experts.name,
      role: schema.experts.role,
      description: schema.experts.description,
      projectId: schema.experts.projectId,
      projectName: schema.projects.name,
      createdAt: schema.experts.createdAt,
      analysisCount: count(schema.analyses.id),
      lastAnalysisAt: max(schema.analyses.createdAt),
    })
    .from(schema.experts)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.experts.projectId))
    .leftJoin(schema.analyses, eq(schema.analyses.expertId, schema.experts.id))
    .where(eq(schema.experts.ownerId, userId))
    .groupBy(schema.experts.id, schema.projects.name)
    .orderBy(asc(schema.experts.name));
}
export type ExpertListItem = Awaited<ReturnType<typeof listExperts>>[number];

export async function getExpert(userId: string, id: string) {
  const db = await getDb();
  const e = await db.query.experts.findFirst({ where: and(eq(schema.experts.id, id), eq(schema.experts.ownerId, userId)) });
  if (!e) throw notFound("Eksperten");
  return e;
}

export async function createExpert(userId: string, raw: unknown) {
  const input = ExpertInputSchema.parse(raw);
  await assertProject(userId, input.projectId);
  const db = await getDb();
  const [e] = await db.insert(schema.experts).values({ ...input, ownerId: userId }).returning();
  return e!;
}

export async function updateExpert(userId: string, id: string, raw: unknown) {
  await getExpert(userId, id);
  const input = ExpertInputSchema.partial().parse(raw);
  if (input.projectId !== undefined) await assertProject(userId, input.projectId);
  const db = await getDb();
  const [e] = await db.update(schema.experts).set(input).where(eq(schema.experts.id, id)).returning();
  return e!;
}

export async function deleteExpert(userId: string, id: string) {
  await getExpert(userId, id);
  const db = await getDb();
  await db.delete(schema.experts).where(eq(schema.experts.id, id));
}

export async function listProjects(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      description: schema.projects.description,
      createdAt: schema.projects.createdAt,
      analysisCount: count(schema.analyses.id),
    })
    .from(schema.projects)
    .leftJoin(schema.analyses, eq(schema.analyses.projectId, schema.projects.id))
    .where(eq(schema.projects.ownerId, userId))
    .groupBy(schema.projects.id)
    .orderBy(asc(schema.projects.name));
}

export async function createProject(userId: string, raw: unknown) {
  const input = ProjectInputSchema.parse(raw);
  const db = await getDb();
  const [p] = await db.insert(schema.projects).values({ ...input, ownerId: userId }).returning();
  return p!;
}

export async function deleteProject(userId: string, id: string) {
  const db = await getDb();
  const p = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.ownerId, userId)) });
  if (!p) throw notFound("Projektet");
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}
