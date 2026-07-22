import { clamp } from "@1mm/shared";

export interface RankableMemory {
  id: string;
  /** Cosine similarity to the current query, 0..1. */
  similarity: number;
  importanceScore: number;
  /** Days since the memory was last updated. */
  ageDays: number;
}

/**
 * Combined relevance score: semantic similarity dominates, importance and
 * freshness break ties. Pure function → easy to unit test and tune.
 */
export function scoreMemory(memory: RankableMemory): number {
  const similarity = clamp(memory.similarity, 0, 1);
  const importance = clamp(memory.importanceScore, 0, 1);
  // Half-life of ~90 days: old memories decay but never reach zero.
  const recency = Math.pow(0.5, memory.ageDays / 90);
  return similarity * 0.65 + importance * 0.25 + recency * 0.1;
}

/** Ranks memories by combined score and keeps the top `limit`. */
export function rankMemories<T extends RankableMemory>(memories: T[], limit: number): T[] {
  return [...memories].sort((a, b) => scoreMemory(b) - scoreMemory(a)).slice(0, Math.max(0, limit));
}

/** Two memories above this similarity are considered duplicates. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

export function isDuplicate(similarity: number): boolean {
  return similarity >= DUPLICATE_SIMILARITY_THRESHOLD;
}
