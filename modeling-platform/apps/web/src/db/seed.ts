/**
 * `pnpm db:seed` — opretter en demokonto med eksperter, projekt og færdige
 * analyser (kørt gennem den rigtige analyzer med mock-provideren), så
 * dashboard, sammenligning og mønsterforslag har data at vise.
 *
 *   Login: demo@parresia.dk / demo1234
 */
import { eq } from "drizzle-orm";
import { MockLlmClient, RateLimiter, analyzeTranscript } from "@bm/core";
import { DEMO_TRANSCRIPTS, SELF_DEMO_TRANSCRIPT } from "@bm/core/demo";
import { closeDb, getDb, schema } from "./index";
import { hashPassword } from "../server/password";
import { runBeliefMatch } from "../server/belief-matches";
import { runModeling } from "../server/modeling";

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

const analysisIds: string[] = [];
const transcripts = [...DEMO_TRANSCRIPTS, { ...SELF_DEMO_TRANSCRIPT, self: true }].sort((a, b) => b.daysAgo - a.daysAgo);
for (const t of transcripts) {
  const self = "self" in t && t.self;
  if (!experts.has(t.expert)) {
    const [e] = await db
      .insert(schema.experts)
      .values({ ownerId: user!.id, projectId: self ? null : project!.id, name: t.expert, role: t.role, isSelf: self })
      .returning();
    experts.set(t.expert, e!.id);
  }
  const env = await analyzeTranscript({ transcript: t.transcript, context: { subjectName: t.expert, domain: t.role } }, { llm, limiter });
  const date = new Date(Date.now() - t.daysAgo * 86400_000);
  const [row] = await db.insert(schema.analyses).values({
    ownerId: user!.id,
    projectId: self ? null : project!.id,
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
  }).returning();
  analysisIds.push(row!.id);
  console.log(`✓ ${t.expert}: ${t.title}`);
}

// Overbevisnings-match, som det sker efter hver analyse (her med mock-provideren).
for (const id of analysisIds) await runBeliefMatch(id, undefined, { llm });
const matchCount = (await db.select().from(schema.beliefMatches)).filter((m) => m.ownerId === user!.id).length;
console.log(`✓ Overbevisnings-match: ${matchCount} match på tværs af ${experts.size} personer`);

// Gustavs modelleringskort efter hver analyse, ældste først (så det nyeste kort bygger på hele historikken).
const chronological = (await db.select({ id: schema.analyses.id, createdAt: schema.analyses.createdAt, ownerId: schema.analyses.ownerId }).from(schema.analyses))
  .filter((a) => a.ownerId === user!.id)
  .sort((a, b) => +a.createdAt - +b.createdAt);
for (const a of chronological) await runModeling(a.id, undefined, { llm });
const maps = (await db.select().from(schema.modelingMaps)).filter((m) => m.ownerId === user!.id && m.status === "done");
console.log(`✓ Modelleringskort: ${maps.length} kort, gennemsnitlig præcision ${Math.round(maps.reduce((n, m) => n + m.precision, 0) / Math.max(1, maps.length))} %`);
await closeDb();
console.log(`\nDemokonto klar → ${EMAIL} / ${PASSWORD}`);
