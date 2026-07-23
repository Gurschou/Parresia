import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Migrations are hand-maintained in ./migrations because
 * drizzle-kit cannot express TimescaleDB hypertables, continuous aggregates,
 * or the write-once triggers on the Intervention Ledger. The schema files in
 * ./schema are the source of truth for the TypeScript types; the SQL in
 * ./migrations is the source of truth for the database. Keep them in sync.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://onemm:onemm@localhost:5432/onemm",
  },
});
