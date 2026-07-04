/**
 * Memory domain model.
 *
 * Memory in SYNAPSE is layered:
 *  - session: current conversation working memory
 *  - short-term: recent days, decays quickly
 *  - long-term: durable facts and history
 *  - identity: who the user is — values, beliefs, goals, habits
 *  - learning: what SYNAPSE has learned about how to help this user
 *
 * Records are retrieved intelligently (semantic + recency + importance),
 * not just stored.
 */
export type MemoryLayer =
  | "session"
  | "short-term"
  | "long-term"
  | "identity"
  | "learning";

export type MemoryKind =
  | "fact"
  | "goal"
  | "value"
  | "belief"
  | "habit"
  | "commitment"
  | "breakthrough"
  | "conversation"
  | "reflection"
  | "pattern"
  | "preference";

export interface MemoryRecord {
  id: string;
  userId: string;
  layer: MemoryLayer;
  kind: MemoryKind;
  content: string;
  /** 0..1 — drives retrieval ranking together with recency and similarity. */
  importance: number;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  /** Optional structured payload, e.g. commitment {action, due, status}. */
  metadata?: Record<string, unknown>;
  /** Embedding vector when the store supports semantic search. */
  embedding?: number[];
  tags: string[];
}

export interface MemoryQuery {
  userId: string;
  /** Free-text query for semantic/keyword matching. */
  text?: string;
  layers?: MemoryLayer[];
  kinds?: MemoryKind[];
  tags?: string[];
  limit?: number;
}

export interface ScoredMemory {
  record: MemoryRecord;
  /** Combined relevance score, 0..1. */
  score: number;
}
