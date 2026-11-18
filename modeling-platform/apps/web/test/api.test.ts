import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnalysisResultSchema, SAMPLE_TRANSCRIPT } from "@bm/core";

/**
 * Endpoint-tests: kalder de rigtige route-handlere med in-memory PGlite,
 * mock-LLM og mock-transskribering. Kun sessionen (Auth.js) er mocket.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; name: string; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));

import { closeDb, getDb, schema } from "@/db";
import * as analysesRoute from "@/app/api/analyses/route";
import * as analysisRoute from "@/app/api/analyses/[id]/route";
import * as statusRoute from "@/app/api/analyses/[id]/status/route";
import * as reportRoute from "@/app/api/analyses/[id]/report/route";
import * as retryRoute from "@/app/api/analyses/[id]/retry/route";
import * as registerRoute from "@/app/api/register/route";
import * as expertsRoute from "@/app/api/experts/route";
import * as patternsRoute from "@/app/api/patterns/route";
import * as suggestionsRoute from "@/app/api/patterns/suggestions/route";
import * as compareRoute from "@/app/api/compare/route";
import * as dashboardRoute from "@/app/api/dashboard/route";
import * as uploadsRoute from "@/app/api/uploads/route";
import * as healthRoute from "@/app/api/health/route";
import * as expertRoute from "@/app/api/experts/[id]/route";
import * as matchesRoute from "@/app/api/analyses/[id]/matches/route";
import * as beliefsRoute from "@/app/api/beliefs/route";
import * as backfillRoute from "@/app/api/beliefs/backfill/route";
import * as modelRoute from "@/app/api/analyses/[id]/model/route";
import * as modelExportRoute from "@/app/api/analyses/[id]/model/export/route";
import * as modelingRoute from "@/app/api/modeling/route";
import * as modelBackfillRoute from "@/app/api/modeling/backfill/route";
import { DEMO_TRANSCRIPTS, SELF_DEMO_TRANSCRIPT } from "@bm/core/demo";

const BASE = "http://test.local";
const json = (path: string, body: unknown, method = "POST") =>
  new Request(BASE + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (path: string) => new Request(BASE + path);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function createUser(email: string) {
  const res = await registerRoute.POST(json("/api/register", { name: "Test Bruger", email, password: "hemmelig123" }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; name: string; email: string };
}
const loginAs = (u: { id: string; name: string; email: string } | null) => {
  session.current = u ? { user: u } : null;
};

async function waitForStatus(id: string, statuses: string[], timeoutMs = 30_000) {
  const t0 = Date.now();
  for (;;) {
    const res = await statusRoute.GET(get(`/api/analyses/${id}/status`), ctx(id));
    const body = await res.json();
    if (statuses.includes(body.status)) return body;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout; sidste status ${body.status}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

let alice: { id: string; name: string; email: string };
let bob: { id: string; name: string; email: string };

beforeAll(async () => {
  await getDb();
  alice = await createUser("alice@example.com");
  bob = await createUser("bob@example.com");
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 200));
  await closeDb();
});

describe("auth & registrering", () => {
  it("afviser dubletter og ugyldigt input", async () => {
    expect((await registerRoute.POST(json("/api/register", { name: "X", email: "alice@example.com", password: "hemmelig123" }))).status).toBe(422);
    const dup = await registerRoute.POST(json("/api/register", { name: "Alice", email: "ALICE@example.com", password: "hemmelig123" }));
    expect(dup.status).toBe(409);
    const bad = await registerRoute.POST(json("/api/register", { name: "Alice", email: "ikke-en-mail", password: "kort" }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe("validation_error");
  });

  it("beskyttede endpoints kræver login (401)", async () => {
    loginAs(null);
    const res = await analysesRoute.GET(get("/api/analyses"), undefined);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("health svarer ok", async () => {
    const res = await healthRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).llm.provider).toBe("mock");
  });
});

describe("analyse-flow", () => {
  let analysisId = "";
  let expertId = "";

  it("opretter ekspert og validerer projekt-ejerskab", async () => {
    loginAs(alice);
    const res = await expertsRoute.POST(json("/api/experts", { name: "Mette Holm", role: "Salgsdirektør" }), undefined);
    expect(res.status).toBe(201);
    expertId = (await res.json()).id;
    const bad = await expertsRoute.POST(json("/api/experts", { name: "X", projectId: "findes-ikke" }), undefined);
    expect(bad.status).toBe(422);
  });

  it("validerer input (tomt transskript → 422)", async () => {
    loginAs(alice);
    const res = await analysesRoute.POST(json("/api/analyses", { transcript: "   " }), undefined);
    expect(res.status).toBe(422);
  });

  it("starter en analyse (202), kører den i baggrunden og gemmer et schema-gyldigt resultat", async () => {
    loginAs(alice);
    const res = await analysesRoute.POST(json("/api/analyses", { transcript: SAMPLE_TRANSCRIPT, expertId, context: { goal: "Lukke store aftaler" } }), undefined);
    expect(res.status).toBe(202);
    const body = await res.json();
    analysisId = body.id;
    expect(res.headers.get("location")).toBe(`/api/analyses/${analysisId}`);

    const status = await waitForStatus(analysisId, ["completed", "failed"]);
    expect(status.status).toBe("completed");
    expect(status.progress).toBe(100);

    const full = await (await analysisRoute.GET(get(`/api/analyses/${analysisId}`), ctx(analysisId))).json();
    expect(AnalysisResultSchema.safeParse(full.result).success).toBe(true);
    expect(full.result.summary.subject).toBe("Mette Holm");
    expect(full.meta.provider).toBe("mock");
    expect(full.uploadPath).toBeUndefined();
  });

  it("andre brugere kan ikke se analysen (404)", async () => {
    loginAs(bob);
    expect((await analysisRoute.GET(get(`/api/analyses/${analysisId}`), ctx(analysisId))).status).toBe(404);
    expect((await reportRoute.GET(get(`/api/analyses/${analysisId}/report`), ctx(analysisId))).status).toBe(404);
  });

  it("genererer rapporter som Markdown, JSON og PDF", async () => {
    loginAs(alice);
    const md = await reportRoute.GET(get(`/api/analyses/${analysisId}/report?format=md`), ctx(analysisId));
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("content-disposition")).toMatch(/attachment; filename="adfaerdsmodel-mette-holm-\d{4}-\d{2}-\d{2}\.md"/);
    expect(await md.text()).toContain("## Kognitive strategier");

    const js = await reportRoute.GET(get(`/api/analyses/${analysisId}/report?format=json`), ctx(analysisId));
    const parsed = await js.json();
    expect(parsed.schema_version).toBe(1);
    expect(AnalysisResultSchema.safeParse(parsed.result).success).toBe(true);

    const pdf = await reportRoute.GET(get(`/api/analyses/${analysisId}/report?format=pdf`), ctx(analysisId));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    expect((await reportRoute.GET(get(`/api/analyses/${analysisId}/report?format=docx`), ctx(analysisId))).status).toBe(400);
  });

  it("lister, omdøber og filtrerer analyser", async () => {
    loginAs(alice);
    const patch = await analysisRoute.PATCH(json(`/api/analyses/${analysisId}`, { title: "Salgsinterview", sessionDate: "2026-11-01" }, "PATCH"), ctx(analysisId));
    expect(patch.status).toBe(200);
    const list = await (await analysesRoute.GET(get(`/api/analyses?expertId=${expertId}`), undefined)).json();
    expect(list.items.map((i: { title: string }) => i.title)).toContain("Salgsinterview");
    const none = await (await analysesRoute.GET(get(`/api/analyses?status=failed`), undefined)).json();
    expect(none.items).toHaveLength(0);
  });

  it("lyd-upload → mock-transskribering → analyse", async () => {
    loginAs(alice);
    const bad = await uploadsRoute.POST(new Request(BASE + "/api/uploads", { method: "POST", headers: { "x-file-name": "noter.exe" }, body: "x" }), undefined);
    expect(bad.status).toBe(415);
    const up = await uploadsRoute.POST(
      new Request(BASE + "/api/uploads", { method: "POST", headers: { "x-file-name": encodeURIComponent("møde 1.mp3") }, body: new Uint8Array(2048).fill(7) }),
      undefined,
    );
    expect(up.status).toBe(201);
    const { uploadId, kind } = await up.json();
    expect(kind).toBe("audio");

    const res = await analysesRoute.POST(json("/api/analyses", { uploadId, expertId }), undefined);
    expect(res.status).toBe(202);
    const { id } = await res.json();
    const s = await waitForStatus(id, ["completed", "failed"]);
    expect(s.status).toBe("completed");
    const full = await (await analysisRoute.GET(get(`/api/analyses/${id}`), ctx(id))).json();
    expect(full.sourceType).toBe("audio");
    expect(full.sourceName).toBe("møde 1.mp3");
    expect(full.transcript.length).toBeGreaterThan(500);
    expect(full.mediaInfo.provider).toBe("mock");

    // Samme upload kan ikke bruges to gange
    const again = await analysesRoute.POST(json("/api/analyses", { uploadId }), undefined);
    expect(again.status).toBe(404);
  });

  it("fejl gemmes med kode og dansk besked, og kan køres igen", async () => {
    loginAs(alice);
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const res = await analysesRoute.POST(json("/api/analyses", { transcript: SAMPLE_TRANSCRIPT }), undefined);
    const { id } = await res.json();
    const s = await waitForStatus(id, ["failed", "completed"]);
    expect(s.status).toBe("failed");
    expect(s.errorCode).toBe("missing_api_key");
    expect(s.errorMessage).toContain("ANTHROPIC_API_KEY");
    vi.unstubAllEnvs();

    const retry = await retryRoute.POST(json(`/api/analyses/${id}/retry`, {}), ctx(id));
    expect(retry.status).toBe(202);
    expect((await waitForStatus(id, ["completed", "failed"])).status).toBe("completed");
    // En færdig analyse kan ikke køres igen
    expect((await retryRoute.POST(json(`/api/analyses/${id}/retry`, {}), ctx(id))).status).toBe(409);
  });

  it("håndhæver kvoten pr. bruger (429)", async () => {
    loginAs(bob);
    vi.stubEnv("USER_ANALYSES_PER_HOUR", "1");
    expect((await analysesRoute.POST(json("/api/analyses", { transcript: SAMPLE_TRANSCRIPT }), undefined)).status).toBe(202);
    const second = await analysesRoute.POST(json("/api/analyses", { transcript: SAMPLE_TRANSCRIPT }), undefined);
    expect(second.status).toBe(429);
    expect((await second.json()).error.code).toBe("quota_exceeded");
    vi.unstubAllEnvs();
  });

  it("sammenligning, dashboard og mønsterbibliotek", async () => {
    loginAs(alice);
    const ids = (await (await analysesRoute.GET(get("/api/analyses?status=completed"), undefined)).json()).items.map((i: { id: string }) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    expect((await compareRoute.GET(get(`/api/compare?ids=${ids[0]}`), undefined)).status).toBe(422);
    const cmp = await (await compareRoute.GET(get(`/api/compare?ids=${ids.slice(0, 2).join(",")}`), undefined)).json();
    expect(cmp.columns).toHaveLength(2);
    expect(cmp.needs).toHaveLength(6);

    const dash = await (await dashboardRoute.GET(get("/api/dashboard"), undefined)).json();
    expect(dash.totals.analyses).toBeGreaterThanOrEqual(2);

    const created = await patternsRoute.POST(
      json("/api/patterns", {
        title: "Mental generalprøve",
        category: "cognitive_strategies",
        tags: ["forberedelse"],
        examples: [{ analysisId: ids[0], excerpt: { label: "Ser mødet for sig", quotes: ["Jeg ser rummet"] } }],
      }),
      undefined,
    );
    expect(created.status).toBe(201);
    const badCat = await patternsRoute.POST(json("/api/patterns", { title: "X y", category: "astrologi" }), undefined);
    expect(badCat.status).toBe(422);
    const list = await (await patternsRoute.GET(get("/api/patterns"), undefined)).json();
    expect(list.items[0].examples).toHaveLength(1);

    const sugg = await (await suggestionsRoute.GET(get("/api/patterns/suggestions?minExperts=1"), undefined)).json();
    expect(Array.isArray(sugg.items)).toBe(true);

    // Bob kan ikke tilføje Alices analyse til sit bibliotek
    loginAs(bob);
    const steal = await patternsRoute.POST(
      json("/api/patterns", { title: "Tyveri", category: "vakog", examples: [{ analysisId: ids[0], excerpt: { label: "x" } }] }),
      undefined,
    );
    expect(steal.status).toBe(422);
  });

  it("sletning fjerner analysen", async () => {
    loginAs(alice);
    const del = await analysisRoute.DELETE(get(`/api/analyses/${analysisId}`), ctx(analysisId));
    expect(del.status).toBe(204);
    expect((await analysisRoute.GET(get(`/api/analyses/${analysisId}`), ctx(analysisId))).status).toBe(404);
    const db = await getDb();
    const examples = await db.select().from(schema.patternExamples);
    expect(examples.every((e) => e.analysisId !== analysisId)).toBe(true);
  });
});

describe("overbevisnings-match", () => {
  let carol: { id: string; name: string; email: string };
  const experts: Record<string, string> = {};
  const analyses: Record<string, string> = {};

  async function waitForMatch(id: string, timeoutMs = 30_000) {
    const t0 = Date.now();
    for (;;) {
      const body = await (await matchesRoute.GET(get(`/api/analyses/${id}/matches`), ctx(id))).json();
      if (body.run && (body.run.status === "done" || body.run.status === "failed")) return body;
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout; match-status ${body.run?.status}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function analyse(name: string, transcript: string) {
    const res = await analysesRoute.POST(json("/api/analyses", { transcript, expertId: experts[name] }), undefined);
    expect(res.status).toBe(202);
    const id = (await res.json()).id as string;
    expect((await waitForStatus(id, ["completed", "failed"])).status).toBe("completed");
    analyses[name] = id;
    return waitForMatch(id);
  }

  it("matcher automatisk hver ny analyse mod alle andre — begge veje", async () => {
    carol = await createUser("carol@example.com");
    loginAs(carol);
    for (const [name, role, isSelf] of [["Mig", "Coach", true], ["Jonas Krag", "Elitesvømmer", false], ["Sara Lund", "Iværksætter", false]] as const) {
      const res = await expertsRoute.POST(json("/api/experts", { name, role, isSelf }), undefined);
      expect(res.status).toBe(201);
      experts[name] = (await res.json()).id;
    }

    // Første person: ingen andre at matche med endnu.
    const first = await analyse("Jonas Krag", DEMO_TRANSCRIPTS.find((t) => t.expert === "Jonas Krag")!.transcript);
    expect(first.run).toMatchObject({ status: "done", personCount: 0, source: "heuristic" });
    expect(first.incoming).toEqual([]);

    // Sara kommer ind: Jonas' "én ting ad gangen" er en modvægt til hendes begrænsning.
    const sara = await analyse("Sara Lund", DEMO_TRANSCRIPTS.find((t) => t.expert === "Sara Lund")!.transcript);
    expect(sara.run.personCount).toBe(1);
    const counter = sara.incoming.find((m: { kind: string }) => m.kind === "counter");
    expect(counter).toMatchObject({ belief: { statement: "Én ting ad gangen gør mig bedre." }, from: { name: "Jonas Krag" }, to: { name: "Sara Lund" } });
    expect(sara.outgoing.length).toBeGreaterThan(0);
    expect(sara.outgoing.every((m: { to: { name: string } }) => m.to.name === "Jonas Krag")).toBe(true);

    // Brugeren selv kommer ind: begge eksperter har noget, der passer.
    const me = await analyse("Mig", SELF_DEMO_TRANSCRIPT.transcript);
    expect(me.person).toMatchObject({ name: "Mig", isSelf: true });
    expect(me.run.personCount).toBe(2);
    const fromNames = new Set(me.incoming.map((m: { from: { name: string } }) => m.from.name));
    expect(fromNames).toEqual(new Set(["Jonas Krag", "Sara Lund"]));
    expect(me.incoming.some((m: { kind: string; anchor: { text: string } }) => m.kind === "counter" && /styr på det hele/.test(m.anchor.text))).toBe(true);
  });

  it("samlet visning vælger dig selv som standard og kan skifte person", async () => {
    loginAs(carol);
    const view = await (await beliefsRoute.GET(get("/api/beliefs"), undefined)).json();
    expect(view.selected).toMatchObject({ name: "Mig", isSelf: true });
    expect(view.persons.map((p: { name: string }) => p.name)[0]).toBe("Mig");
    expect(view.persons).toHaveLength(3);
    expect(view.incoming.length).toBeGreaterThan(0);
    expect(view.activeRuns).toBe(0);
    expect(view.unmatchedAnalyses).toBe(0);

    const sara = await (await beliefsRoute.GET(get(`/api/beliefs?person=${experts["Sara Lund"]}`), undefined)).json();
    expect(sara.selected.name).toBe("Sara Lund");
    // Saras match fra både hendes egen kørsel og de senere (Mig) er med.
    expect(sara.incoming.length + sara.outgoing.length + sara.shared.length).toBeGreaterThan(sara.incoming.length);
    expect(sara.outgoing.some((m: { to: { name: string } }) => m.to.name === "Mig")).toBe(true);
  });

  it("kun én 'det er mig' pr. bruger, og PATCH rører ikke andre felter", async () => {
    loginAs(carol);
    const res = await expertRoute.PATCH(json(`/api/experts/${experts["Sara Lund"]}`, { isSelf: true }, "PATCH"), ctx(experts["Sara Lund"]!));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ isSelf: true, role: "Iværksætter", name: "Sara Lund" });
    const list = (await (await expertsRoute.GET(get("/api/experts"), undefined)).json()).items as { name: string; isSelf: boolean }[];
    expect(list.filter((e) => e.isSelf).map((e) => e.name)).toEqual(["Sara Lund"]);
    await expertRoute.PATCH(json(`/api/experts/${experts["Mig"]}`, { isSelf: true }, "PATCH"), ctx(experts["Mig"]!));
  });

  it("andre brugere kan hverken se eller køre match (404)", async () => {
    loginAs(bob);
    const id = analyses["Mig"]!;
    expect((await matchesRoute.GET(get(`/api/analyses/${id}/matches`), ctx(id))).status).toBe(404);
    expect((await matchesRoute.POST(json(`/api/analyses/${id}/matches`, {}), ctx(id))).status).toBe(404);
    const view = await (await beliefsRoute.GET(get("/api/beliefs"), undefined)).json();
    expect(view.persons.some((p: { name: string }) => p.name === "Mig" || p.name === "Jonas Krag")).toBe(false);
  });

  it("kan køre igen og matche analyser, der mangler et match", async () => {
    loginAs(carol);
    const id = analyses["Jonas Krag"]!;
    expect((await matchesRoute.POST(json(`/api/analyses/${id}/matches`, {}), ctx(id))).status).toBe(202);
    const again = await waitForMatch(id);
    // Nu er der to andre personer i biblioteket.
    expect(again.run.personCount).toBe(2);

    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.beliefMatchRuns).where(eq(schema.beliefMatchRuns.analysisId, analyses["Sara Lund"]!));
    const res = await backfillRoute.POST(json("/api/beliefs/backfill", {}), undefined);
    expect(res.status).toBe(202);
    expect((await res.json()).queued).toBe(1);
    expect((await waitForMatch(analyses["Sara Lund"]!)).run.status).toBe("done");
  });
});

describe("modelleringskort (Gustavs modellering)", () => {
  let dana: { id: string; name: string; email: string };
  const experts: Record<string, string> = {};
  const ids: string[] = [];

  async function waitForModel(id: string, timeoutMs = 30_000) {
    const t0 = Date.now();
    for (;;) {
      const body = await (await modelRoute.GET(get(`/api/analyses/${id}/model`), ctx(id))).json();
      if (body.map && (body.map.status === "done" || body.map.status === "failed")) return body;
      if (Date.now() - t0 > timeoutMs) throw new Error(`timeout; model-status ${body.map?.status}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function analyse(name: string, transcript: string) {
    const res = await analysesRoute.POST(json("/api/analyses", { transcript, expertId: experts[name] }), undefined);
    const id = (await res.json()).id as string;
    expect((await waitForStatus(id, ["completed", "failed"])).status).toBe("completed");
    ids.push(id);
    return { id, body: await waitForModel(id) };
  }

  it("modellerer personen automatisk ud fra alle samtalerne og efterprøver citaterne", async () => {
    dana = await createUser("dana@example.com");
    loginAs(dana);
    for (const [name, role, isSelf] of [["Mig", "Coach", true], ["Mette Holm", "Salgsdirektør", false]] as const) {
      const res = await expertsRoute.POST(json("/api/experts", { name, role, isSelf }), undefined);
      experts[name] = (await res.json()).id;
    }
    const me = await analyse("Mig", SELF_DEMO_TRANSCRIPT.transcript);
    expect(me.body.person).toMatchObject({ name: "Mig", isSelf: true });
    expect(me.body.map).toMatchObject({ status: "done", source: "heuristic", sessionCount: 1 });

    const [m1, m2] = DEMO_TRANSCRIPTS.filter((t) => t.expert === "Mette Holm");
    const first = await analyse("Mette Holm", m1!.transcript);
    expect(first.body.map.result.sessions).toHaveLength(1);
    const second = await analyse("Mette Holm", m2!.transcript);
    const r = second.body.map.result;
    // Det nye kort bygger på begge Mettes samtaler, den nye først.
    expect(r.sessions.map((s: { analysisId: string }) => s.analysisId)).toEqual([second.id, first.id]);
    expect(r.audit.quotes_removed).toBe(0);
    expect(r.audit.sessions_used).toBe(2);
    expect(second.body.map.precision).toBe(r.audit.precision);
    // Brugerens egen profil bruges til installationsplanens forventede modstand.
    expect(r.map.installation.resistance).toMatch(/styr på det hele/);
  });

  it("visningen vælger dig som standard, kan skifte person og vise kortet over tid", async () => {
    loginAs(dana);
    const view = await (await modelingRoute.GET(get("/api/modeling"), undefined)).json();
    expect(view.selected).toMatchObject({ name: "Mig", isSelf: true });
    expect(view.map.result.person.name).toBe("Mig");
    expect(view.activeRuns).toBe(0);

    const mette = await (await modelingRoute.GET(get(`/api/modeling?person=${experts["Mette Holm"]}`), undefined)).json();
    expect(mette.selected.name).toBe("Mette Holm");
    expect(mette.history).toHaveLength(2);
    expect(mette.map.analysisId).toBe(ids[2]);
    const older = await (await modelingRoute.GET(get(`/api/modeling?analysis=${ids[1]}`), undefined)).json();
    expect(older.selected.name).toBe("Mette Holm");
    expect(older.map.analysisId).toBe(ids[1]);
  });

  it("eksporterer kortet som Markdown, PDF og JSON", async () => {
    loginAs(dana);
    const id = ids[2]!;
    const md = await modelExportRoute.GET(get(`/api/analyses/${id}/model/export?format=md`), ctx(id));
    expect(md.status).toBe(200);
    const text = await md.text();
    expect(text).toContain("# Modelleringskort: Mette Holm");
    expect(text).toContain("Installationsplan (RPM)");
    const pdf = await modelExportRoute.GET(get(`/api/analyses/${id}/model/export?format=pdf`), ctx(id));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const js = await (await modelExportRoute.GET(get(`/api/analyses/${id}/model/export?format=json`), ctx(id))).json();
    expect(js.audit.precision).toBeGreaterThan(0);
  });

  it("andre brugere kan hverken se, eksportere eller køre kortet (404)", async () => {
    loginAs(bob);
    const id = ids[2]!;
    expect((await modelRoute.GET(get(`/api/analyses/${id}/model`), ctx(id))).status).toBe(404);
    expect((await modelRoute.POST(json(`/api/analyses/${id}/model`, {}), ctx(id))).status).toBe(404);
    expect((await modelExportRoute.GET(get(`/api/analyses/${id}/model/export?format=md`), ctx(id))).status).toBe(404);
    const view = await (await modelingRoute.GET(get("/api/modeling"), undefined)).json();
    expect(view.persons.some((p: { name: string }) => p.name === "Mette Holm")).toBe(false);
  });

  it("kan modellere igen og bygge kort for personer, der mangler et", async () => {
    loginAs(dana);
    const id = ids[0]!;
    expect((await modelRoute.POST(json(`/api/analyses/${id}/model`, {}), ctx(id))).status).toBe(202);
    expect((await waitForModel(id)).map.status).toBe("done");

    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.modelingMaps).where(eq(schema.modelingMaps.analysisId, ids[0]!));
    const res = await modelBackfillRoute.POST(json("/api/modeling/backfill", {}), undefined);
    expect(res.status).toBe(202);
    expect((await res.json()).queued).toBe(1);
    expect((await waitForModel(ids[0]!)).map.status).toBe("done");
  });
});
