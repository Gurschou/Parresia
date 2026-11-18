import { describe, expect, it } from "vitest";
import { MODELING_API_JSON_SCHEMA, modelPerson, parseModelingResponse } from "../src/analyzer/model-person";
import { AnalysisError } from "../src/analyzer/errors";
import {
  ModelingMapSchema,
  buildModelingReport,
  buildModelingSource,
  checkQuote,
  heuristicModelingMap,
  indexSources,
  parseTurns,
  verifyModelingMap,
  type ModelingMap,
  type ModelingSource,
} from "../src/insights/modeling-map";
import { MockLlmClient } from "../src/llm/mock";
import { buildModelingMessage, extractModelingSource } from "../src/prompt/build-modeling-message";
import { SYSTEM_PROMPT } from "../src/prompt/system-prompt";
import { renderMarkdown } from "../src/report/markdown";
import { DEMO_TRANSCRIPTS, SELF_DEMO_TRANSCRIPT } from "../src/testing/demo-transcripts";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { ScriptedLlm, freeLimiter, noSleep } from "./helpers";

const sessionsOf = (expert: string) =>
  [...DEMO_TRANSCRIPTS, SELF_DEMO_TRANSCRIPT]
    .filter((d) => d.expert === expert)
    .map((d, i) => ({
      analysisId: `${expert.split(" ")[0]!.toLowerCase()}-${i}`,
      title: d.title,
      date: new Date(Date.UTC(2026, 9, 1) - d.daysAgo * 864e5),
      transcript: d.transcript,
      result: generateMockAnalysis(d.transcript, { subjectName: d.expert }),
    }))
    .sort((a, b) => +b.date - +a.date);

const sourceFor = (expert: string, isSelf = false): ModelingSource => {
  const [target, ...others] = sessionsOf(expert);
  return buildModelingSource({ person: { name: expert, domain: "", goal: "", isSelf }, target: target!, others });
};

const blank = (): ModelingMap => ({
  core: "",
  result_modeled: "",
  source_basis: "",
  beliefs: [],
  syntax: { name: "", trigger: "", steps: [], test: "", exit: "", notation: "", transferable: true },
  physiology: [],
  state_recipes: { peak: "", peak_quotes: [], crash: "", crash_quotes: [] },
  language: [],
  needs: [],
  rules: [],
  references: { formative: { description: "", decision: "", quotes: [] }, capability: [], danger: [], missing: "" },
  how_it_lands: { chunk_size: "unknown", direction: "unknown", convincer: "", advice: "", quotes: [] },
  do_not_copy: [],
  tension: { text: "", quotes: [] },
  leverage: { point: "", why: "", moves_with: "" },
  installation: { result: "", purpose: "", actions: [], focus: "", mastery_note: "", resistance: "" },
  blind_spots: [],
});

describe("talere og citat-opslag", () => {
  const jonas = sourceFor("Jonas Krag");
  const index = indexSources(jonas);

  it("deler transskriptet i replikker og genkender intervieweren", () => {
    const turns = parseTurns(jonas.sessions[0]!.transcript, "Jonas Krag");
    expect(turns.filter((t) => t.interviewer).every((t) => t.speaker === "Interviewer")).toBe(true);
    expect(turns.some((t) => t.speaker === "Jonas" && !t.interviewer)).toBe(true);
    // En person, der hedder noget med "Coach", bliver ikke til intervieweren.
    expect(parseTurns("Coach: Hej.\nInterviewer: Hvad gør du?\nCoach: Jeg forbereder mig.", "Coach Hansen").filter((t) => t.interviewer)).toHaveLength(1);
  });

  it("finder ordrette citater uanset store bogstaver, tegnsætning og udeladelser", () => {
    expect(checkQuote(index, "Jeg har en regel: Tænk før løbet, føl under løbet.")).toEqual({ status: "verified", sessions: ["S1"] });
    expect(checkQuote(index, "jeg har en regel – tænk før løbet føl under løbet")).toMatchObject({ status: "verified" });
    expect(checkQuote(index, "Jeg lytter til den samme sang hver gang … som jeg svømmer i")).toMatchObject({ status: "verified" });
  });

  it("afviser omskrevne citater, interviewerens ord og for korte stumper", () => {
    expect(checkQuote(index, "Jeg har en fast regel: tænk før løbet")).toEqual({ status: "not_found" });
    expect(checkQuote(index, "Hvad sker der i dig, de sidste ti minutter før en finale?")).toEqual({ status: "interviewer" });
    expect(checkQuote(index, "Én.")).toEqual({ status: "too_short" });
    // Hele ord: "løb" må ikke matche midt i "løbet".
    expect(checkQuote(index, "tænk før løb føl")).toEqual({ status: "not_found" });
  });
});

describe("verifyModelingMap (Gustavs præcisionsregler)", () => {
  it("fjerner opfundne citater og sætter fundet ned til lav sikkerhed", () => {
    const src = sourceFor("Jonas Krag");
    const raw = blank();
    raw.beliefs = [
      { statement: "Et tab er feedback.", level: "other", in_action: "Ser videoen samme aften.", say_do: "both", transferable: true, quotes: ["Et tab er bare feedback."], evidence_type: "quote", confidence: "high" },
      { statement: "Jeg er uovervindelig.", level: "identity", in_action: "", say_do: "said_only", transferable: true, quotes: ["Jeg er den bedste i verden."], evidence_type: "quote", confidence: "high" },
    ];
    const r = verifyModelingMap(raw, src);
    expect(r.map.beliefs[0]).toMatchObject({ confidence: "high", evidence_type: "quote", quotes: ["Et tab er bare feedback."] });
    expect(r.map.beliefs[1]).toMatchObject({ confidence: "low", evidence_type: "inference", quotes: [] });
    expect(r.support["beliefs.0"]).toEqual(["S1"]);
    expect(r.support["beliefs.1"]).toBeUndefined();
    expect(r.audit).toMatchObject({ quotes_total: 2, quotes_verified: 1, quotes_removed: 1, downgraded: 1, findings_total: 2, findings_with_evidence: 1, precision: 50 });
  });

  it("fjerner fysiologi uden belæg, tømmer opskrifter uden citater og spørger i stedet", () => {
    const src = sourceFor("Jonas Krag");
    const raw = blank();
    raw.physiology = [
      { text: "Skuldrene falder ned, vejret bliver roligt.", kind: "breath", quotes: ["Skuldrene falder ned. Vejrtrækningen bliver rolig."], evidence_type: "quote", confidence: "high" },
      { text: "Står bredbenet med hævet hage.", kind: "posture", quotes: [], evidence_type: "inference", confidence: "medium" },
    ];
    raw.state_recipes = { peak: "Sang, rytme, let krop.", peak_quotes: ["Først når kroppen føles let, er jeg klar."], crash: "Tænker for meget.", crash_quotes: ["Jeg går helt i panik."] };
    const r = verifyModelingMap(raw, src);
    expect(r.map.physiology.map((p) => p.kind)).toEqual(["breath"]);
    expect(r.audit.physiology_removed).toBe(1);
    expect(r.map.state_recipes.peak).toBe("Sang, rytme, let krop.");
    expect(r.map.state_recipes.crash).toBe("");
    expect(r.audit.emptied).toBe(1);
    // Den formative reference mangler → et spørgsmål under blinde vinkler.
    expect(r.map.blind_spots.some((b) => b.layer === "references")).toBe(true);
  });

  it("beholder kun submodaliteter, der er personens egne ord, og sprog der står ordret", () => {
    const src = sourceFor("Jonas Krag");
    const raw = blank();
    raw.syntax.steps = [
      { channel: "A", direction: "external", instruction: "Lyt til den samme sang.", submodalities: ["bestemt rytme", "høj volumen"], quote: "Jeg hører rytmen og mærker den i kroppen.", evidence_type: "quote", confidence: "high" },
      { channel: "K", direction: "internal", instruction: "Mærk varmen i armene.", submodalities: ["varme"], quote: "Jeg mærker en brændende ild i armene.", evidence_type: "quote", confidence: "medium" },
    ];
    raw.language = [
      { quote: "Et tab er bare feedback.", kind: "setback_frame", reveals: "Tab er information." },
      { quote: "Jeg knuser alle.", kind: "catchphrase", reveals: "x" },
    ];
    const r = verifyModelingMap(raw, src);
    expect(r.map.syntax.steps[0]!.submodalities).toEqual(["bestemt rytme"]);
    expect(r.map.syntax.steps[1]).toMatchObject({ quote: "", confidence: "low", evidence_type: "inference", submodalities: ["varme"] });
    expect(r.audit.submodalities_removed).toBe(1);
    expect(r.map.language.map((l) => l.quote)).toEqual(["Et tab er bare feedback."]);
    expect(r.audit.language_removed).toBe(1);
  });

  it("noterer, når et mønster går igen i flere samtaler, og holder sig til to behov og én handling pr. slags", () => {
    const src = sourceFor("Mette Holm");
    expect(src.sessions).toHaveLength(2);
    const raw = blank();
    raw.beliefs = [
      { statement: "Et nej er information.", level: "other", in_action: "", say_do: "said_only", transferable: true, quotes: ["Et nej er bare information.", "Et nej er bare information."], evidence_type: "quote", confidence: "high" },
    ];
    raw.needs = (["growth", "growth", "connection" as never, "certainty", "variety"] as const)
      .filter((n) => n !== ("connection" as never))
      .map((need) => ({ need, how_fed: "x", cost: "", quotes: [], evidence_type: "inference" as const, confidence: "low" as const }));
    raw.installation.actions = [
      { kind: "belief_evidence", action: "A", trigger: "" },
      { kind: "belief_evidence", action: "B", trigger: "" },
      { kind: "physiology_habit", action: "C", trigger: "" },
    ];
    const r = verifyModelingMap(raw, src);
    expect(r.map.beliefs[0]!.quotes).toEqual(["Et nej er bare information."]);
    expect(r.support["beliefs.0"]).toEqual(["S1", "S2"]);
    expect(r.audit.sessions_used).toBe(2);
    expect(r.map.needs.map((n) => n.need)).toEqual(["growth", "certainty"]);
    expect(r.map.installation.actions.map((a) => a.action)).toEqual(["A", "C"]);
    const md = renderMarkdown(buildModelingReport(r));
    expect(md).toContain("Går igen i 2 samtaler");
  });
});

describe("buildModelingSource", () => {
  it("lægger den udløsende samtale først og respekterer tegnbudgettet", () => {
    const [newest, older] = sessionsOf("Mette Holm");
    const src = buildModelingSource({
      person: { name: "Mette Holm", domain: "", goal: "", isSelf: false },
      target: older!,
      others: [newest!],
      limits: { maxChars: older!.transcript.length + 2500, maxFirstChars: 1e6 },
    });
    expect(src.sessions.map((s) => s.analysisId)).toEqual([older!.analysisId, newest!.analysisId]);
    expect(src.sessions[0]!.included).toBe("full");
    expect(src.sessions[1]!.included).toBe(newest!.transcript.length <= 2500 ? "full" : "partial");
    const tiny = buildModelingSource({ person: src.person, target: older!, others: [newest!], limits: { maxChars: older!.transcript.length + 10 } });
    expect(tiny.sessions[1]!.included).toBe("omitted");
    expect(buildModelingMessage({ source: tiny, mode: "schema" })).not.toContain(`id="S2"`);
  });
});

describe("modelPerson (Claude-kaldet)", () => {
  const src = sourceFor("Jonas Krag");

  it("bruger den uændrede SYSTEM_PROMPT, sender alle samtaler og efterprøver svaret", async () => {
    const raw = blank();
    raw.core = "Jonas er bygget op omkring at mærke frem for at tænke.";
    raw.beliefs = [{ statement: "Jeg præsterer, når jeg føler i stedet for at tænke.", level: "capability", in_action: "Lytter til samme sang.", say_do: "both", transferable: true, quotes: ["Hvis jeg begynder at tænke, bliver jeg langsom."], evidence_type: "quote", confidence: "high" }];
    const llm = new ScriptedLlm([{ text: JSON.stringify(raw) }]);
    const run = await modelPerson(src, { llm, limiter: freeLimiter(), sleep: noSleep });
    const req = llm.requests[0]!;
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.userMessage.startsWith("Opgave: modelleringskort.")).toBe(true);
    expect(req.userMessage).toContain(`<samtale id="S1"`);
    expect(req.userMessage).toContain("Jeg har en regel: Tænk før løbet, føl under løbet.");
    expect(req.userMessage).toContain("<tidligere_fund>");
    expect(req.userMessage).toContain("Konfidens: high = direkte citat");
    expect(req.jsonSchema).toBe(MODELING_API_JSON_SCHEMA);
    expect(run.source).toBe("claude");
    expect(run.result.map.core).toBe(raw.core);
    expect(run.result.map.beliefs[0]!.confidence).toBe("high");
    expect(run.result.audit.precision).toBe(100);
  });

  it("skriver til brugeren selv, når personen er 'mig'", () => {
    const self = sourceFor("Demo Coach", true);
    const msg = buildModelingMessage({ source: self, mode: "schema" });
    expect(msg).toContain("Personen er brugeren selv");
  });

  it("kører en reparationsrunde og falder tilbage til det tekstbaserede kort ved afvisning", async () => {
    const repaired = new ScriptedLlm([{ text: "ikke json" }, { text: JSON.stringify(blank()) }]);
    const a = await modelPerson(src, { llm: repaired, limiter: freeLimiter(), sleep: noSleep });
    expect(repaired.requests[1]!.userMessage).toContain("<rettelse>");
    expect(a.source).toBe("claude");

    const refused = new ScriptedLlm([{ stopReason: "refusal" }]);
    const b = await modelPerson(src, { llm: refused, limiter: freeLimiter(), sleep: noSleep });
    expect(b.source).toBe("heuristic");
    expect(b.meta.fallback_reason).toMatch(/afviste/);
    expect(b.result.map.beliefs.length).toBeGreaterThan(0);
  });

  it("afbrydelse bobler op, og et tomt grundlag afvises", async () => {
    await expect(modelPerson(src, { llm: new ScriptedLlm([new AnalysisError("aborted")]), limiter: freeLimiter(), sleep: noSleep })).rejects.toMatchObject({ code: "aborted" });
    await expect(modelPerson({ ...src, sessions: [] })).rejects.toMatchObject({ code: "input_empty" });
  });

  it("mock-provideren svarer med det tekstbaserede kort, som også består verifikationen", async () => {
    const run = await modelPerson(src, { llm: new MockLlmClient(), limiter: freeLimiter(), sleep: noSleep });
    expect(run.source).toBe("heuristic");
    expect(run.result.audit.quotes_removed).toBe(0);
    expect(run.result.map.physiology.length).toBeGreaterThan(0);
    expect(extractModelingSource(buildModelingMessage({ source: src, mode: "schema" }))?.sessions[0]!.transcript).toBe(src.sessions[0]!.transcript);
    // Det tekstbaserede kort er schema-gyldigt.
    expect(ModelingMapSchema.safeParse(heuristicModelingMap(src)).success).toBe(true);
  });
});

describe("schema og rapport", () => {
  it("modelleringsschemaet overholder API-reglerne (alt required, ingen unions)", () => {
    const walk = (n: unknown, bad: string[], path = "$") => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "object" && o.properties) {
        const req = new Set((o.required as string[]) ?? []);
        for (const k of Object.keys(o.properties as object)) if (!req.has(k)) bad.push(`${path}.${k}`);
      }
      if (o.anyOf || Array.isArray(o.type)) bad.push(`${path}:union`);
      for (const [k, v] of Object.entries(o)) walk(v, bad, `${path}.${k}`);
    };
    const bad: string[] = [];
    walk(MODELING_API_JSON_SCHEMA, bad);
    expect(bad).toEqual([]);
  });

  it("parseModelingResponse retter enum-casing og melder præcise fejl", () => {
    const raw = { ...blank(), how_it_lands: { ...blank().how_it_lands, chunk_size: "GLOBAL" } };
    expect(parseModelingResponse(JSON.stringify(raw))).toMatchObject({ ok: true });
    const bad = parseModelingResponse(JSON.stringify({ core: 1 }));
    expect(bad.ok).toBe(false);
  });

  it("rapporten har alle kortets afsnit og præcisionsafsnittet", async () => {
    const run = await modelPerson(sourceFor("Mette Holm"), { useLlm: false });
    const doc = buildModelingReport(run.result);
    expect(doc.title).toBe("Modelleringskort: Mette Holm");
    expect(doc.sections.map((s) => s.key)).toEqual([
      "core",
      "beliefs",
      "syntax",
      "physiology",
      "language",
      "needs",
      "rules",
      "references",
      "how_it_lands",
      "do_not_copy",
      "leverage",
      "installation",
      "blind_spots",
      "precision",
    ]);
    const md = renderMarkdown(doc);
    expect(md).toContain("Installationsplan (RPM)");
    expect(md).toContain("Fund med ordret belæg");
  });
});
