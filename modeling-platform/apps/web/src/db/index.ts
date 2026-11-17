import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Database-adgang.
 *  - DATABASE_URL=postgres://…  → PostgreSQL via postgres.js (produktion)
 *  - DATABASE_URL tom            → PGlite i ./data/pglite (dev, ingen installation)
 *  - DATABASE_URL=memory://      → PGlite i hukommelsen (tests)
 * Samme Drizzle-schema og samme migrationer i alle tilfælde.
 */
export type Db = PgliteDatabase<typeof schema>;

type DbState = { db: Db; ready: Promise<void>; close: () => Promise<void> };
const g = globalThis as typeof globalThis & { __bmDb?: DbState };

export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");

async function createState(): Promise<DbState> {
  const url = process.env.DATABASE_URL ?? "";
  if (/^postgres(ql)?:\/\//.test(url)) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
    const db = drizzle(client, { schema }) as unknown as Db;
    return {
      db,
      ready: migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let dataDir: string | undefined;
  if (url.startsWith("memory://")) {
    dataDir = undefined;
  } else {
    dataDir = url.startsWith("file:") ? url.slice(5) : (process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite"));
    mkdirSync(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  return { db, ready: migrate(db, { migrationsFolder: MIGRATIONS_DIR }), close: () => client.close() };
}

let pending: Promise<DbState> | null = null;

/** Returnerer en migreret database (lazy — åbnes først ved første kald). */
export async function getDb(): Promise<Db> {
  if (g.__bmDb) {
    await g.__bmDb.ready;
    return g.__bmDb.db;
  }
  pending ??= createState().then((s) => (g.__bmDb = s));
  const state = await pending;
  await state.ready;
  return state.db;
}

/** Lukker forbindelsen (tests/CLI). */
export async function closeDb(): Promise<void> {
  const s = g.__bmDb;
  g.__bmDb = undefined;
  pending = null;
  if (s) await s.close();
}

export { schema };
