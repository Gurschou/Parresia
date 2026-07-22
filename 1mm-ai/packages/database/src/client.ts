import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let cached: Database | null = null;

/**
 * Lazily create a singleton database client. Next.js hot-reloads modules in
 * dev, so the singleton also lives on globalThis to avoid connection leaks.
 */
export function getDb(): Database {
  if (cached) return cached;

  const globalStore = globalThis as typeof globalThis & { __onemmDb?: Database };
  if (globalStore.__onemmDb) {
    cached = globalStore.__onemmDb;
    return cached;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(url, { max: 10, prepare: false });
  cached = drizzle(client, { schema });
  if (process.env.NODE_ENV !== "production") {
    globalStore.__onemmDb = cached;
  }
  return cached;
}

/** Test seam: lets tests inject a PGlite-backed drizzle instance. */
export function setDbForTesting(db: Database): void {
  cached = db;
}
