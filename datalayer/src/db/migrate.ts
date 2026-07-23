import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

/**
 * Minimal ordered-SQL migration runner. We do not use drizzle-kit's runner
 * because the initial migration contains TimescaleDB DDL (hypertables,
 * continuous aggregates) that drizzle-kit cannot generate or track.
 *
 * Continuous aggregates cannot be created inside an explicit transaction,
 * so each migration file runs unwrapped; the applied-migrations bookkeeping
 * is written only after the file succeeds. Migrations must therefore be
 * re-runnable-safe OR applied exactly once (we do the latter).
 */
const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

export async function runMigrations(connectionString?: string): Promise<void> {
  const client = new pg.Client({
    connectionString:
      connectionString ??
      process.env.DATABASE_URL ??
      "postgres://onemm:onemm@localhost:5432/onemm",
  });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM _migrations WHERE name = $1",
        [file],
      );
      if (rows.length > 0) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`applying ${file}...`);
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log("migrations complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
