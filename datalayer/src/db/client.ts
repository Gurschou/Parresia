import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../schema/index.js";

/**
 * One shared pool for the whole data layer. All four stores live in the same
 * Postgres instance in this phase, so cross-store transactions (e.g. GDPR
 * erasure touching Profile + Event Log + Pattern Graph + Ledger) are plain
 * local transactions.
 */
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://onemm:onemm@localhost:5432/onemm",
  max: 10,
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** The transaction handle drizzle passes to db.transaction callbacks. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything you can run queries on. */
export type DbOrTx = Db | Tx;

export async function closeDb(): Promise<void> {
  await pool.end();
}
