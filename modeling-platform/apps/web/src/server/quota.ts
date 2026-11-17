import { and, count, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError } from "./http";

export const analysesPerHour = () => Number.parseInt(process.env.USER_ANALYSES_PER_HOUR ?? "20", 10) || 20;

/**
 * Kvote pr. bruger mod LLM-omkostninger: højst N nye analyser pr. time.
 * Tælles i databasen, så den holder på tværs af genstarter og instanser.
 */
export async function assertWithinQuota(userId: string): Promise<void> {
  const db = await getDb();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(schema.analyses)
    .where(and(eq(schema.analyses.ownerId, userId), gt(schema.analyses.createdAt, since)));
  const limit = analysesPerHour();
  if ((row?.n ?? 0) >= limit) {
    throw new HttpError(
      429,
      "quota_exceeded",
      `Du har nået grænsen på ${limit} analyser pr. time. Prøv igen senere.`,
    );
  }
}
