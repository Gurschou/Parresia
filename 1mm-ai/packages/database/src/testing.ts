import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import type { Database } from "./client";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Spin up an in-process Postgres (PGlite) with pgvector and apply the real
 * SQL migrations. Used by unit/integration tests – no Docker required.
 */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const pglite = new PGlite({ extensions: { vector } });

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(join(migrationsDir, file), "utf8");
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) {
        await pglite.exec(trimmed);
      }
    }
  }

  const db = drizzle(pglite, { schema });
  return {
    // PGlite and postgres.js drizzle instances share the same query-builder
    // surface; the cast keeps a single Database type across the codebase.
    db: db as unknown as Database,
    close: () => pglite.close(),
  };
}
