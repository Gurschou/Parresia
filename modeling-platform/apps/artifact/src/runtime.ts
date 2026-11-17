/**
 * Minimale typer for de artifact-capabilities, siden bruger (runtime-kontrakt
 * 0.2.96): sample, db, user og downloads. Alle hentes med claude.use() og
 * kan være null — siden skal virke uden dem.
 */

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}
export interface SampleResult {
  text: string;
  truncated: boolean;
  modelTierApplied: "default" | "complex" | "quick";
}
export interface SampleFn {
  (
    input: string,
    options?: {
      onText?: (u: { text: string; delta: string }) => void;
      signal?: AbortSignal;
      modelTier?: "default" | "complex" | "quick";
      cache?: boolean | { gcTime?: number; refresh?: boolean };
    },
  ): Promise<SampleResult>;
}

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface QuerySnap {
  docs: DocSnap[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface CollectionRef {
  doc(id?: string): DocRef;
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
export interface Db {
  collection(path: string): CollectionRef;
}
export interface UserCap {
  id(): Promise<string | null>;
}
export interface DownloadsCap {
  save(req: { filename: string; data: string | Blob | ArrayBuffer }): Promise<{ status: "saved" | "delivered" }>;
}

interface CapMap {
  sample: SampleFn;
  db: Db;
  user: UserCap;
  downloads: DownloadsCap;
}

declare global {
  interface Window {
    claude?: { use<K extends keyof CapMap>(name: K): Promise<CapMap[K] | null> };
  }
}

/** Henter en capability; null når siden ikke kører i en Claude-viewer, eller den ikke er tilgængelig. */
export async function useCap<K extends keyof CapMap>(name: K): Promise<CapMap[K] | null> {
  try {
    return (await window.claude?.use(name)) ?? null;
  } catch {
    return null;
  }
}
