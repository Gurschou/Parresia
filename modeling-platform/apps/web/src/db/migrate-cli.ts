/** `pnpm db:migrate` — opretter/migrerer databasen (PGlite eller PostgreSQL). */
import { closeDb, getDb } from "./index";

const started = Date.now();
await getDb();
await closeDb();
const url = process.env.DATABASE_URL ?? "";
const target = /^postgres/.test(url) ? "PostgreSQL" : url.startsWith("memory://") ? "PGlite (hukommelse)" : `PGlite (${process.env.PGLITE_DIR || "~/.parresia-modeling/pglite"})`;
console.log(`✓ Database migreret (${Date.now() - started} ms) — ${target}`);
