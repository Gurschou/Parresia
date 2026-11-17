/**
 * `pnpm db:seed` — opretter en demokonto med eksperter, projekt og færdige
 * analyser (kørt gennem den rigtige analyzer med mock-provideren), så
 * dashboard, sammenligning og mønsterforslag har data at vise.
 *
 *   Login: demo@parresia.dk / demo1234
 */
import { eq } from "drizzle-orm";
import { MockLlmClient, RateLimiter, analyzeTranscript } from "@bm/core";
import { DEMO_TRANSCRIPTS } from "@bm/core/demo";
import { closeDb, getDb, schema } from "./index";
import { hashPassword } from "../server/password";

const EMAIL = process.env.SEED_EMAIL ?? "demo@parresia.dk";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo1234";

const db = await getDb();
const existing = await db.query.users.findFirst({ where: eq(schema.users.email, EMAIL) });
if (existing) {
  await db.delete(schema.users).where(eq(schema.users.id, existing.id));
  console.log(`↺ Fjernede eksisterende demokonto ${EMAIL}`);
}
const [user] = await db
  .insert(schema.users)
  .values({ email: EMAIL, name: "Demo Coach", passwordHash: await hashPassword(PASSWORD) })
  .returning();
const [project] = await db
  .insert(schema.projects)
  .values({ ownerId: user!.id, name: "High performers 2026", description: "Modellering af topperformere på tværs af domæner." })
  .returning();

const experts = new Map<string, string>();
const llm = new MockLlmClient();
const limiter = new RateLimiter({ maxConcurrent: 4, maxRequests: 1000 });

for (const t of DEMO_TRANSCRIPTS) {
  if (!experts.has(t.expert)) {
    const [e] = await db
      .insert(schema.experts)
      .values({ ownerId: user!.id, projectId: project!.id, name: t.expert, role: t.role })
      .returning();
    experts.set(t.expert, e!.id);
  }
  const env = await analyzeTranscript({ transcript: t.transcript, context: { subjectName: t.expert, domain: t.role } }, { llm, limiter });
  const date = new Date(Date.now() - t.daysAgo * 86400_000);
  await db.insert(schema.analyses).values({
    ownerId: user!.id,
    projectId: project!.id,
    expertId: experts.get(t.expert)!,
    title: t.title,
    sourceType: "text",
    transcript: t.transcript,
    context: { domain: t.role },
    status: "completed",
    progress: 100,
    stageMessage: "Færdig",
    result: env.result,
    meta: env.meta,
    schemaVersion: env.schema_version,
    model: env.meta.model,
    inputTokens: env.meta.input_tokens,
    outputTokens: env.meta.output_tokens,
    sessionDate: date.toISOString().slice(0, 10),
    createdAt: date,
    completedAt: date,
  });
  console.log(`✓ ${t.expert}: ${t.title}`);
}
await closeDb();
console.log(`\nDemokonto klar → ${EMAIL} / ${PASSWORD}`);
