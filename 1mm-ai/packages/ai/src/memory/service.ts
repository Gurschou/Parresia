import { and, cosineDistance, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { memories, userPreferences, type Database, type MemoryRow } from "@1mm/database";
import { LIMITS } from "@1mm/shared";
import type { AIProvider } from "../provider/types";
import { extractMemoryCandidates, type MemoryCandidate } from "./extract";
import { isDuplicate, rankMemories } from "./rank";

export interface RelevantMemory {
  id: string;
  category: MemoryRow["category"];
  content: string;
  similarity: number;
}

/** Only memories that are alive right now (not deleted, not expired). */
function aliveMemoryFilter(userId: string) {
  return and(
    eq(memories.userId, userId),
    isNull(memories.deletedAt),
    or(isNull(memories.expiresAt), gt(memories.expiresAt, new Date())),
  );
}

/**
 * Semantic retrieval for prompt building: pgvector narrows the candidate set,
 * then `rankMemories` combines similarity, importance and recency.
 */
export async function findRelevantMemories(
  db: Database,
  provider: AIProvider,
  params: { userId: string; query: string; limit?: number },
): Promise<RelevantMemory[]> {
  const limit = params.limit ?? LIMITS.maxMemoriesInPrompt;
  const [queryEmbedding] = await provider.embed([params.query.slice(0, 2_000)]);
  if (!queryEmbedding) return [];

  const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, queryEmbedding)})`;
  const rows = await db
    .select({
      id: memories.id,
      category: memories.category,
      content: memories.content,
      importanceScore: memories.importanceScore,
      updatedAt: memories.updatedAt,
      similarity,
    })
    .from(memories)
    .where(and(aliveMemoryFilter(params.userId), sql`${memories.embedding} IS NOT NULL`))
    .orderBy(desc(similarity))
    .limit(limit * 3);

  const now = Date.now();
  const ranked = rankMemories(
    rows.map((row) => ({
      ...row,
      similarity: Number(row.similarity),
      importanceScore: Number(row.importanceScore),
      ageDays: Math.max(0, (now - row.updatedAt.getTime()) / 86_400_000),
    })),
    limit,
  );

  return ranked.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    similarity: r.similarity,
  }));
}

/**
 * Store candidates with semantic de-duplication: a near-duplicate updates the
 * existing memory instead of creating endless copies.
 */
export async function upsertMemoryCandidates(
  db: Database,
  provider: AIProvider,
  params: { userId: string; sourceConversationId: string | null; candidates: MemoryCandidate[] },
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const candidate of params.candidates) {
    const [embedding] = await provider.embed([candidate.content]);
    if (!embedding) continue;

    const similarity = sql<number>`1 - (${cosineDistance(memories.embedding, embedding)})`;
    const [existing] = await db
      .select({ id: memories.id, similarity })
      .from(memories)
      .where(and(aliveMemoryFilter(params.userId), sql`${memories.embedding} IS NOT NULL`))
      .orderBy(desc(similarity))
      .limit(1);

    if (existing && isDuplicate(Number(existing.similarity))) {
      await db
        .update(memories)
        .set({
          content: candidate.content,
          category: candidate.category,
          importanceScore: candidate.importance.toFixed(2),
          confidenceScore: candidate.confidence.toFixed(2),
          embedding,
          updatedAt: new Date(),
        })
        .where(and(eq(memories.id, existing.id), eq(memories.userId, params.userId)));
      updated++;
    } else {
      await db.insert(memories).values({
        userId: params.userId,
        sourceConversationId: params.sourceConversationId,
        category: candidate.category,
        content: candidate.content,
        importanceScore: candidate.importance.toFixed(2),
        confidenceScore: candidate.confidence.toFixed(2),
        embedding,
      });
      created++;
    }
  }

  return { created, updated };
}

/** Reads a user preference with a default. Keys are namespaced by column. */
export async function getUserPreference<T>(
  db: Database,
  userId: string,
  key: string,
  defaultValue: T,
): Promise<T> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .limit(1);
  return row ? (row.value as T) : defaultValue;
}

/**
 * Post-conversation memory pass: respects the user's auto-memory setting,
 * extracts candidates and stores them with de-duplication.
 */
export async function processConversationMemories(
  db: Database,
  provider: AIProvider,
  params: { userId: string; conversationId: string; transcript: string },
): Promise<{ created: number; updated: number } | null> {
  const autoMemoryEnabled = await getUserPreference(db, params.userId, "autoMemoryEnabled", true);
  if (!autoMemoryEnabled) return null;

  const candidates = await extractMemoryCandidates(provider, params.transcript);
  if (candidates.length === 0) return { created: 0, updated: 0 };

  return upsertMemoryCandidates(db, provider, {
    userId: params.userId,
    sourceConversationId: params.conversationId,
    candidates,
  });
}
