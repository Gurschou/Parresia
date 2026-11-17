/**
 * Kører én gang ved serverstart: migrér databasen, genoptag ufærdige jobs
 * og ryd gamle uploads. Kun i Node-runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_STARTUP_TASKS === "1") return;
  try {
    const { getDb } = await import("@/db");
    const { resumePendingJobs } = await import("@/server/jobs");
    const { cleanupStaleUploads } = await import("@/server/uploads");
    await getDb();
    const resumed = await resumePendingJobs();
    const cleaned = await cleanupStaleUploads();
    if (resumed || cleaned) console.log(`[startup] genoptog ${resumed} job(s), ryddede ${cleaned} gamle upload(s)`);
  } catch (err) {
    console.error("[startup] kunne ikke initialisere databasen", err);
  }
}
