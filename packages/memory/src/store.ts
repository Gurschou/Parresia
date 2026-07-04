/**
 * MemoryStore — the persistence port for memory records.
 *
 * The engine only depends on this interface (hexagonal architecture).
 * Implementations provided here:
 *  - InMemoryStore: tests and ephemeral sessions.
 *  - FileMemoryStore: durable local development (one JSON file per user).
 * Production adapters (Postgres + pgvector, Pinecone, …) implement the same
 * port without touching engine code.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MemoryQuery, MemoryRecord } from "@synapse/shared";

export interface MemoryStore {
  insert(record: MemoryRecord): Promise<void>;
  update(record: MemoryRecord): Promise<void>;
  /** Candidate fetch — coarse filtering; fine ranking happens in recall. */
  find(query: MemoryQuery): Promise<MemoryRecord[]>;
  all(userId: string): Promise<MemoryRecord[]>;
}

function matches(record: MemoryRecord, query: MemoryQuery): boolean {
  if (record.userId !== query.userId) return false;
  if (query.layers && !query.layers.includes(record.layer)) return false;
  if (query.kinds && !query.kinds.includes(record.kind)) return false;
  if (query.tags && !query.tags.some((tag) => record.tags.includes(tag))) {
    return false;
  }
  return true;
}

export class InMemoryStore implements MemoryStore {
  protected records = new Map<string, MemoryRecord>();

  async insert(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async update(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async find(query: MemoryQuery): Promise<MemoryRecord[]> {
    return [...this.records.values()].filter((r) => matches(r, query));
  }

  async all(userId: string): Promise<MemoryRecord[]> {
    return [...this.records.values()].filter((r) => r.userId === userId);
  }
}

/** JSON-file-backed store for local development. */
export class FileMemoryStore extends InMemoryStore {
  private readonly path: string;
  private loaded = false;

  constructor(dataDir: string, name = "memory") {
    super();
    this.path = join(dataDir, `${name}.json`);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.path, "utf-8");
      for (const record of JSON.parse(raw) as MemoryRecord[]) {
        this.records.set(record.id, record);
      }
    } catch {
      // first run — no file yet
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify([...this.records.values()], null, 2),
      "utf-8",
    );
  }

  override async insert(record: MemoryRecord): Promise<void> {
    await this.load();
    await super.insert(record);
    await this.persist();
  }

  override async update(record: MemoryRecord): Promise<void> {
    await this.load();
    await super.update(record);
    await this.persist();
  }

  override async find(query: MemoryQuery): Promise<MemoryRecord[]> {
    await this.load();
    return super.find(query);
  }

  override async all(userId: string): Promise<MemoryRecord[]> {
    await this.load();
    return super.all(userId);
  }
}
