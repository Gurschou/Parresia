import { defineConfig } from "drizzle-kit";

// DIRECT_URL bypasses connection poolers for DDL; falls back to DATABASE_URL.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: url ?? "postgresql://postgres:postgres@localhost:5432/onemm_ai",
  },
});
