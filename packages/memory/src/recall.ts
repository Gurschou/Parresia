/**
 * Hybrid recall ranking.
 *
 * Relevance = weighted blend of:
 *  - semantic similarity (embedding cosine when embeddings exist,
 *    otherwise lexical token overlap as a graceful fallback)
 *  - recency (exponential decay, half-life per memory layer)
 *  - importance (author-assigned 0..1)
 *  - reinforcement (how often the memory has proven useful)
 *
 * This is what makes memory "intelligently retrieved, not just stored".
 */
import type { MemoryLayer, MemoryRecord, ScoredMemory } from "@synapse/shared";

const HALF_LIFE_DAYS: Record<MemoryLayer, number> = {
  session: 0.5,
  "short-term": 7,
  "long-term": 120,
  identity: 365,
  learning: 180,
};

const WEIGHTS = {
  similarity: 0.45,
  recency: 0.25,
  importance: 0.2,
  reinforcement: 0.1,
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2),
  );

export function lexicalSimilarity(query: string, content: string): number {
  const q = tokenize(query);
  const c = tokenize(content);
  if (q.size === 0 || c.size === 0) return 0;
  let overlap = 0;
  for (const token of q) if (c.has(token)) overlap += 1;
  return overlap / q.size;
}

export function recencyScore(record: MemoryRecord, now: Date): number {
  const ageDays =
    (now.getTime() - new Date(record.lastAccessedAt).getTime()) /
    (1000 * 60 * 60 * 24);
  const halfLife = HALF_LIFE_DAYS[record.layer];
  return Math.pow(0.5, Math.max(ageDays, 0) / halfLife);
}

export function rankMemories(
  candidates: MemoryRecord[],
  options: {
    queryText?: string;
    queryEmbedding?: number[];
    now?: Date;
    limit?: number;
  },
): ScoredMemory[] {
  const now = options.now ?? new Date();
  const scored = candidates.map((record): ScoredMemory => {
    let similarity = 0;
    if (options.queryEmbedding && record.embedding) {
      similarity = cosineSimilarity(options.queryEmbedding, record.embedding);
    } else if (options.queryText) {
      similarity = lexicalSimilarity(options.queryText, record.content);
    } else {
      // No query — pure recency/importance ranking; treat similarity as neutral.
      similarity = 0.5;
    }
    const reinforcement = Math.min(record.accessCount / 10, 1);
    const score =
      WEIGHTS.similarity * similarity +
      WEIGHTS.recency * recencyScore(record, now) +
      WEIGHTS.importance * record.importance +
      WEIGHTS.reinforcement * reinforcement;
    return { record, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.limit ?? 10);
}
