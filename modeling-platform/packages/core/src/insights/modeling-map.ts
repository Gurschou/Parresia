import { z } from "zod";
import type { AnalysisResult } from "../categories/registry";
import { Confidence, EvidenceType, HumanNeedKey, Quotes, evidenceFields, type RepSystem } from "../schema/common";
import { CONFIDENCE_LABEL, EVIDENCE_LABEL, HUMAN_NEED_LABEL, REP_SYSTEM_LABEL, nonEmpty } from "../schema/labels";
import type { Badge, ReportBlock, ReportDocument, ReportItem, ReportSection, Tone } from "../report/blocks";
import { generateMockAnalysis } from "../testing/mock-analysis";
import { similarity } from "./text-similarity";

/**
 * GUSTAVS MODELLERING — modelleringskortet.
 *
 * Én person modelleres ud fra ALLE personens transskripter efter Gustavs
 * metode (modelleringskort + dybdeprofil + strategi-udledning): tre døre
 * (overbevisninger, mental syntaks, fysiologi) oven på de seks behov, sprog,
 * regler, referenceoplevelser, hvordan det lander hos personen, hvad der ikke
 * skal kopieres, spændingen, millimeteren, en RPM-installationsplan og blinde
 * vinkler.
 *
 * Præcision håndhæves lokalt EFTER modelsvaret (`verifyModelingMap`):
 *  - hvert citat skal findes ordret i personens egne replikker (ikke
 *    interviewerens) — ellers fjernes det
 *  - sikkerheden sættes efter Gustavs konfidensregel: intet belæg → lav
 *  - fysiologi uden belæg fjernes (kropssprog udledes aldrig af tekst)
 *  - submodaliteter skal være personens egne ord
 *  - tomme felter er tilladt, gætterier er ikke: opskrifter og den formative
 *    reference uden belæg tømmes og bliver til spørgsmål under blinde vinkler
 */

// ── Enum-koder og danske labels ──────────────────────────────────────────────

export const BELIEF_LEVELS = ["identity", "capability", "cause_effect", "world", "other"] as const;
export type BeliefLevel = (typeof BELIEF_LEVELS)[number];
export const BELIEF_LEVEL_LABEL: Record<BeliefLevel, string> = {
  identity: "Identitet",
  capability: "Evne",
  cause_effect: "Årsag og virkning",
  world: "Verden og andre",
  other: "Anden",
};

export const SAY_DO = ["both", "said_only", "done_only", "conflict"] as const;
export type SayDo = (typeof SAY_DO)[number];
export const SAY_DO_LABEL: Record<SayDo, string> = {
  both: "Siger og gør",
  said_only: "Kun sagt",
  done_only: "Set i handling",
  conflict: "Handling modsiger",
};

export const SYNTAX_CHANNELS = ["V", "A", "K", "O", "G", "Ad", "action"] as const;
export type SyntaxChannel = (typeof SYNTAX_CHANNELS)[number];
export const SYNTAX_CHANNEL_LABEL: Record<SyntaxChannel, string> = { ...REP_SYSTEM_LABEL, action: "Handling" };

export const PHYSIOLOGY_KINDS = ["posture", "breath", "movement", "energy", "ritual", "sleep", "training", "voice", "other"] as const;
export type PhysiologyKind = (typeof PHYSIOLOGY_KINDS)[number];
export const PHYSIOLOGY_KIND_LABEL: Record<PhysiologyKind, string> = {
  posture: "Holdning",
  breath: "Vejrtrækning",
  movement: "Bevægelse",
  energy: "Energi",
  ritual: "Ritual",
  sleep: "Søvn",
  training: "Træning",
  voice: "Stemme",
  other: "Andet",
};

export const LANGUAGE_KINDS = ["metaphor", "self_talk", "setback_frame", "question", "catchphrase"] as const;
export type LanguageKind = (typeof LANGUAGE_KINDS)[number];
export const LANGUAGE_KIND_LABEL: Record<LanguageKind, string> = {
  metaphor: "Metafor",
  self_talk: "Selvtale",
  setback_frame: "Sådan rammes modgang ind",
  question: "Gennemgående spørgsmål",
  catchphrase: "Fast vending",
};

export const RULE_KINDS = ["always", "never", "must", "standard"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const RULE_KIND_LABEL: Record<RuleKind, string> = { always: "Altid", never: "Aldrig", must: "Skal", standard: "Standard" };

export const CHUNK_SIZES = ["global", "specific", "mixed", "unknown"] as const;
export const CHUNK_SIZE_LABEL: Record<(typeof CHUNK_SIZES)[number], string> = {
  global: "Overblik først",
  specific: "Detaljer først",
  mixed: "Begge dele",
  unknown: "Fremgår ikke",
};
export const DIRECTIONS = ["toward", "away_from", "mixed", "unknown"] as const;
export const DIRECTION_LABEL: Record<(typeof DIRECTIONS)[number], string> = {
  toward: "Mod noget",
  away_from: "Væk fra noget",
  mixed: "Begge veje",
  unknown: "Fremgår ikke",
};

export const NOT_COPY_REASONS = ["context", "luck", "resources", "era", "personality", "cost"] as const;
export const NOT_COPY_REASON_LABEL: Record<(typeof NOT_COPY_REASONS)[number], string> = {
  context: "Kontekst",
  luck: "Held",
  resources: "Ressourcer",
  era: "Tid og sted",
  personality: "Personlighed",
  cost: "Koster andre steder",
};

export const ACTION_KINDS = ["belief_evidence", "syntax_practice", "physiology_habit"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  belief_evidence: "Bevis for overbevisningen",
  syntax_practice: "Øv syntaksen",
  physiology_habit: "Fysisk vane",
};

export const MAP_LAYERS = ["beliefs", "syntax", "physiology", "language", "needs", "rules", "references", "how_it_lands", "other"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
export const MAP_LAYER_LABEL: Record<MapLayer, string> = {
  beliefs: "Overbevisninger",
  syntax: "Mental syntaks",
  physiology: "Fysiologi",
  language: "Sprog",
  needs: "Behov",
  rules: "Regler",
  references: "Referenceoplevelser",
  how_it_lands: "Sådan lander det",
  other: "Andet",
};

// ── Schema (modelsvaret) ─────────────────────────────────────────────────────

const Q = Quotes;

export const ModelingMapSchema = z.object({
  core: z.string().describe("KERNEN: én sætning — hvad personen er bygget op omkring, sagt lige ud"),
  result_modeled: z.string().describe("Det specifikke resultat, der er værd at kopiere — én sætning"),
  source_basis: z.string().describe("Hvilken slags materiale og hvor meget det afslører — ét ærligt tjek"),
  beliefs: z.array(
    z.object({
      statement: z.string().describe("Overbevisningen i første person, som personen opererer ud fra"),
      level: z.enum(BELIEF_LEVELS),
      in_action: z.string().describe("Den konkrete handling i materialet, der viser overbevisningen i drift, eller tom streng"),
      say_do: z.enum(SAY_DO),
      transferable: z.boolean().describe("true hvis den kan installeres hos andre; false hvis den hænger på kontekst"),
      ...evidenceFields,
    }),
  ),
  syntax: z.object({
    name: z.string().describe("Kort navn på strategien"),
    trigger: z.string().describe("Hvad der sætter sekvensen i gang"),
    steps: z.array(
      z.object({
        channel: z.enum(SYNTAX_CHANNELS),
        direction: z.enum(["internal", "external"]),
        instruction: z.string().describe("Trinnet i bydeform, så man kan køre det i morgen"),
        submodalities: z.array(z.string()).describe("Kvaliteter ved trinnet med personens egne ord, fx 'helt tydeligt', 'tæt på', 'rolig'"),
        quote: z.string().describe("Ordret citat, der belægger trinnet, eller tom streng"),
        evidence_type: EvidenceType,
        confidence: Confidence,
      }),
    ),
    test: z.string().describe("TOTE-test: kriteriet personen tester mod"),
    exit: z.string().describe("Hvornår personen er færdig"),
    notation: z.string().describe("Notation, fx 'Ve → Ad → Ki → action → Exit'"),
    transferable: z.boolean(),
  }),
  physiology: z.array(z.object({ text: z.string(), kind: z.enum(PHYSIOLOGY_KINDS), ...evidenceFields })),
  state_recipes: z.object({
    peak: z.string().describe("Personens dokumenterede opskrift på sin bedste tilstand, eller tom streng"),
    peak_quotes: Q,
    crash: z.string().describe("Personens lige så pålidelige opskrift på at gå ned, eller tom streng"),
    crash_quotes: Q,
  }),
  language: z.array(
    z.object({
      quote: z.string().describe("Ordret vending"),
      kind: z.enum(LANGUAGE_KINDS),
      reveals: z.string().describe("Hvilken overbevisning sproget afslører og forstærker"),
    }),
  ),
  needs: z.array(
    z.object({
      need: HumanNeedKey,
      how_fed: z.string().describe("Hvordan personens mønstre fodrer behovet"),
      cost: z.string().describe("Prisen for måden behovet fodres på, eller tom streng"),
      ...evidenceFields,
    }),
  ),
  rules: z.array(z.object({ rule: z.string().describe("'Jeg gør altid/aldrig …' eller en standard"), kind: z.enum(RULE_KINDS), ...evidenceFields })),
  references: z.object({
    formative: z.object({
      description: z.string().describe("Den oplevelse, hvor den nuværende regel blev installeret, eller tom streng"),
      decision: z.string().describe("Den mening, der blev truffet dér, eller tom streng"),
      quotes: Q,
    }),
    capability: z.array(z.object({ description: z.string(), quotes: Q })),
    danger: z.array(z.object({ description: z.string(), quotes: Q })),
    missing: z.string().describe("Hvad personen mangler bevis for (den manglende reference)"),
  }),
  how_it_lands: z.object({
    chunk_size: z.enum(CHUNK_SIZES),
    direction: z.enum(DIRECTIONS),
    convincer: z.string().describe("Hvad der skal til, før personen tror på noget"),
    advice: z.string().describe("Én sætning: sådan taler man, så det går ind"),
    quotes: Q,
  }),
  do_not_copy: z.array(z.object({ item: z.string(), reason: z.enum(NOT_COPY_REASONS), explanation: z.string() })),
  tension: z.object({ text: z.string().describe("SPÆNDINGEN: det ene sted hvor to lag modsiger hinanden"), quotes: Q }),
  leverage: z.object({
    point: z.string().describe("MILLIMETEREN: ét leverage-punkt"),
    why: z.string().describe("Hvorfor netop dér"),
    moves_with: z.string().describe("Hvilke andre lag der flytter sig med"),
  }),
  installation: z.object({
    result: z.string().describe("Ét specifikt, målbart, dateret resultat"),
    purpose: z.string().describe("Den følelsesmæssige grund, knyttet til behovene"),
    actions: z.array(z.object({ kind: z.enum(ACTION_KINDS), action: z.string(), trigger: z.string().describe("Den konkrete situation, handlingen knyttes til") })),
    focus: z.string().describe("Koncentrationsprincippet: det ENE punkt denne uge, med deadline og et menneske i"),
    mastery_note: z.string().describe("Mestringstempo: hvilket niveau 30-dages-tjekket måler"),
    resistance: z.string().describe("Installatørens egne overbevisninger, der sandsynligvis gør modstand, eller tom streng"),
  }),
  blind_spots: z.array(
    z.object({
      question: z.string().describe("Konkret spørgsmål, fx 'Tænk på en gang, hvor …'"),
      layer: z.enum(MAP_LAYERS),
      why: z.string().describe("Hvad svaret ville afklare"),
    }),
  ),
});
export type ModelingMap = z.infer<typeof ModelingMapSchema>;

// ── Kildegrundlag ────────────────────────────────────────────────────────────

/** Én samtale med personen. S1 er altid den analyse, der udløste kørslen. */
export interface ModelingSession {
  id: string;
  analysisId: string;
  title: string;
  date: string;
  transcript: string;
  /** Den første analyse af samtalen (bruges som hypoteser og til den tekstbaserede udgave). */
  result: AnalysisResult | null;
  /** Hvor meget af transskriptet, der kom med i prompten. */
  included: "full" | "partial" | "omitted";
  includedChars: number;
}

export interface ModelingSource {
  person: { name: string; domain: string; goal: string; isSelf: boolean };
  /** Brugeren selv (når personen ikke er brugeren): bruges til installationsplanens modstand. */
  installer: { name: string; disenabling: string[]; dominant_needs: HumanNeedKey[] } | null;
  sessions: ModelingSession[];
}

export const MODELING_LIMITS = { maxSessions: 12, maxChars: 320_000, maxFirstChars: 200_000 };

export interface SessionInput {
  analysisId: string;
  title: string;
  date: string | Date;
  transcript: string;
  result: AnalysisResult | null;
}

const isoDate = (d: string | Date) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

/**
 * Samler kildegrundlaget: den udløsende samtale først (S1), derefter de
 * øvrige nyeste først, inden for tegnbudgettet.
 */
export function buildModelingSource(opts: {
  person: ModelingSource["person"];
  target: SessionInput;
  others: SessionInput[];
  installer?: ModelingSource["installer"];
  limits?: Partial<typeof MODELING_LIMITS>;
}): ModelingSource {
  const lim = { ...MODELING_LIMITS, ...opts.limits };
  const others = [...opts.others]
    .filter((s) => s.analysisId !== opts.target.analysisId && s.transcript.trim())
    .sort((a, b) => isoDate(b.date).localeCompare(isoDate(a.date)))
    .slice(0, lim.maxSessions - 1);
  let budget = lim.maxChars;
  const sessions: ModelingSession[] = [opts.target, ...others].map((s, i) => {
    const cap = i === 0 ? Math.min(lim.maxFirstChars, budget) : budget;
    const len = s.transcript.length;
    const included: ModelingSession["included"] = len <= cap ? "full" : cap >= 2000 ? "partial" : "omitted";
    const includedChars = included === "omitted" ? 0 : Math.min(len, cap);
    budget -= includedChars;
    return { id: `S${i + 1}`, analysisId: s.analysisId, title: s.title, date: isoDate(s.date), transcript: s.transcript, result: s.result, included, includedChars };
  });
  return { person: opts.person, installer: opts.installer ?? null, sessions };
}

/** Den tekst, prompten får med fra en samtale (afkortet efter budgettet). */
export function promptTranscript(s: ModelingSession): string {
  if (s.included === "full") return s.transcript;
  if (s.included === "omitted") return "";
  return `${s.transcript.slice(0, s.includedChars)}\n[… afkortet]`;
}

// ── Talere og citat-verifikation ─────────────────────────────────────────────

const SPEAKER_RE = /^\s*(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*)?([\p{L}][\p{L}\p{N} .'-]{0,40}?)\s*:\s+(.*)$/u;
const INTERVIEWER_RE = /^(interviewer(en)?|interviewer \d+|i|q|int|spørger|spørgsmål|journalist|vært(en)?|host|moderator|coach(en)?)$/i;

export interface Turn {
  speaker: string | null;
  interviewer: boolean;
  text: string;
}

/** Deler et transskript op i replikker og markerer interviewerens. */
export function parseTurns(transcript: string, personName = ""): Turn[] {
  const lines = transcript.split(/\r?\n/);
  const labelled = lines.filter((l) => SPEAKER_RE.test(l)).length;
  if (labelled < 2) return [{ speaker: null, interviewer: false, text: transcript }];
  const nameTokens = personName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const isInterviewer = (label: string) => {
    const l = label.trim().toLowerCase();
    if (nameTokens.some((t) => l.split(/\s+/).includes(t))) return false;
    return INTERVIEWER_RE.test(l);
  };
  const turns: Turn[] = [];
  for (const line of lines) {
    const m = line.match(SPEAKER_RE);
    if (m) turns.push({ speaker: m[1]!.trim(), interviewer: isInterviewer(m[1]!), text: m[2] ?? "" });
    else if (turns.length) turns[turns.length - 1]!.text += `\n${line}`;
    else if (line.trim()) turns.push({ speaker: null, interviewer: false, text: line });
  }
  return turns;
}

/** Normalisering til ordret sammenligning: små bogstaver, ingen tegnsætning/anførselstegn. */
export function normalizeForQuote(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

interface IndexedSession {
  id: string;
  subject: string;
  all: string;
}

export interface QuoteIndex {
  sessions: IndexedSession[];
}

export function indexSources(source: ModelingSource): QuoteIndex {
  return {
    sessions: source.sessions.map((s) => {
      const turns = parseTurns(s.transcript, source.person.name);
      return {
        id: s.id,
        subject: ` ${turns
          .filter((t) => !t.interviewer)
          .map((t) => normalizeForQuote(t.text))
          .join(" | ")} `,
        all: ` ${normalizeForQuote(s.transcript)} `,
      };
    }),
  };
}

export type QuoteCheck = { status: "verified"; sessions: string[] } | { status: "interviewer" | "not_found" | "too_short" };

const containsInOrder = (hay: string, fragments: string[]) => {
  let from = 0;
  for (const f of fragments) {
    const i = hay.indexOf(f, from);
    if (i < 0) return false;
    from = i + f.length - 1;
  }
  return true;
};

/**
 * Finder et citat ordret i personens egne replikker. Udeladelser markeret med
 * "…" eller "[...]" er tilladt; delene skal så stå i samme rækkefølge.
 */
export function checkQuote(index: QuoteIndex, quote: string): QuoteCheck {
  const fragments = quote
    .split(/\[\s*(?:\.\.\.|…)\s*\]|…|\.{3,}/)
    .map(normalizeForQuote)
    .filter((f) => f.length > 0);
  const total = fragments.join(" ").length;
  if (total < 8) return { status: "too_short" };
  // Hele ord: hvert fragment skal stå mellem mellemrum i den normaliserede tekst.
  const padded = fragments.map((f) => ` ${f} `);
  const sessions = index.sessions.filter((s) => containsInOrder(s.subject, padded)).map((s) => s.id);
  if (sessions.length) return { status: "verified", sessions };
  if (index.sessions.some((s) => containsInOrder(s.all, padded))) return { status: "interviewer" };
  return { status: "not_found" };
}

/** Er en submodalitet personens egne ord (findes den i deres replikker)? */
function ownWords(index: QuoteIndex, phrase: string): boolean {
  const n = normalizeForQuote(phrase);
  if (n.length < 3) return false;
  return index.sessions.some((s) => s.subject.includes(` ${n} `));
}

// ── Verifikation ─────────────────────────────────────────────────────────────

export interface ModelingAudit {
  /** Citater i modelsvaret. */
  quotes_total: number;
  /** Fundet ordret i personens egne replikker. */
  quotes_verified: number;
  /** Fjernet: ikke fundet, for korte eller sagt af intervieweren. */
  quotes_removed: number;
  interviewer_quotes: number;
  /** Fund med belæg (citater eller trin med citat) ud af alle fund. */
  findings_total: number;
  findings_with_evidence: number;
  /** Fund, hvis sikkerhed blev sat ned efter konfidensreglen. */
  downgraded: number;
  physiology_removed: number;
  language_removed: number;
  submodalities_removed: number;
  /** Tømte felter (opskrifter, formativ reference) uden belæg. */
  emptied: number;
  sessions_total: number;
  sessions_used: number;
  /** 0-100: andel af fundene, der står på ordrette, verificerede citater. */
  precision: number;
}

export interface ModelingSessionRef {
  id: string;
  analysisId: string;
  title: string;
  date: string;
  included: ModelingSession["included"];
}

export interface ModelingMapResult {
  map: ModelingMap;
  /** Sti → samtaler med belæg, fx "beliefs.0" → ["S1", "S3"]. */
  support: Record<string, string[]>;
  audit: ModelingAudit;
  sessions: ModelingSessionRef[];
  person: ModelingSource["person"];
}

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const LIMITS = { beliefs: 6, physiology: 6, language: 6, needs: 2, rules: 6, capability: 4, danger: 4, do_not_copy: 5, blind_spots: 5, steps: 9 };

/**
 * Efterprøver modelsvaret mod transskripterne og håndhæver Gustavs
 * præcisionsregler. Det er den eneste vej fra modelsvar til gemt kort.
 */
export function verifyModelingMap(raw: ModelingMap, source: ModelingSource): ModelingMapResult {
  const index = indexSources(source);
  const support: Record<string, string[]> = {};
  const audit: ModelingAudit = {
    quotes_total: 0,
    quotes_verified: 0,
    quotes_removed: 0,
    interviewer_quotes: 0,
    findings_total: 0,
    findings_with_evidence: 0,
    downgraded: 0,
    physiology_removed: 0,
    language_removed: 0,
    submodalities_removed: 0,
    emptied: 0,
    sessions_total: source.sessions.length,
    sessions_used: 0,
    precision: 0,
  };
  const used = new Set<string>();

  /** Beholder kun verificerede citater (uden dubletter) og noterer samtalerne. */
  const keep = (quotes: string[], path: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    const sessions = new Set(support[path] ?? []);
    for (const q of quotes) {
      if (!nonEmpty(q)) continue;
      audit.quotes_total++;
      const key = normalizeForQuote(q);
      const r = checkQuote(index, q);
      if (r.status === "verified" && !seen.has(key)) {
        seen.add(key);
        out.push(q.trim().replace(/^["“”„«»']+|["“”„«»']+$/g, ""));
        audit.quotes_verified++;
        for (const s of r.sessions) {
          sessions.add(s);
          used.add(s);
        }
      } else {
        if (r.status !== "verified") audit.quotes_removed++;
        if (r.status === "interviewer") audit.interviewer_quotes++;
      }
    }
    if (sessions.size) support[path] = [...sessions].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    return out;
  };

  /** Gustavs konfidensregel: uden verificeret belæg kan et fund højst være "lav". */
  const settle = <T extends { quotes: string[]; evidence_type: EvidenceType; confidence: Confidence }>(item: T, path: string): T => {
    const quotes = keep(item.quotes, path);
    audit.findings_total++;
    let { evidence_type, confidence } = item;
    if (quotes.length) {
      audit.findings_with_evidence++;
    } else {
      if (evidence_type === "quote") evidence_type = "inference";
      if (CONF_RANK[confidence] > 0) {
        confidence = "low";
        audit.downgraded++;
      }
    }
    return { ...item, quotes, evidence_type, confidence };
  };

  const dedupe = <T>(xs: T[], text: (x: T) => string, threshold = 0.75) =>
    xs.filter((x, i) => !xs.slice(0, i).some((y) => similarity(text(x), text(y)) >= threshold || normalizeForQuote(text(x)) === normalizeForQuote(text(y))));

  const beliefs = dedupe(raw.beliefs.filter((b) => nonEmpty(b.statement)), (b) => b.statement)
    .slice(0, LIMITS.beliefs)
    .map((b, i) => settle(b, `beliefs.${i}`));

  const steps = raw.syntax.steps.slice(0, LIMITS.steps).map((s, i) => {
    const path = `syntax.steps.${i}`;
    const [quote = ""] = keep(nonEmpty(s.quote) ? [s.quote] : [], path);
    const submodalities = s.submodalities.filter((w) => {
      const ok = ownWords(index, w);
      if (!ok) audit.submodalities_removed++;
      return ok;
    });
    audit.findings_total++;
    let { evidence_type, confidence } = s;
    if (quote) audit.findings_with_evidence++;
    else {
      if (evidence_type === "quote") evidence_type = "inference";
      if (CONF_RANK[confidence] > 0) {
        confidence = "low";
        audit.downgraded++;
      }
    }
    return { ...s, quote, submodalities, evidence_type, confidence };
  });

  // Fysiologi udledes aldrig af tekst: kun beskrevne, belagte fund bliver.
  const physiology = raw.physiology
    .filter((p) => nonEmpty(p.text))
    .map((p, i) => ({ p, quotes: keep(p.quotes, `physiology.${i}`), i }))
    .filter(({ quotes, i }) => {
      if (!quotes.length) {
        audit.physiology_removed++;
        delete support[`physiology.${i}`];
      }
      return quotes.length > 0;
    })
    .slice(0, LIMITS.physiology);
  // Stierne skal følge den endelige rækkefølge.
  const physiologyOut = physiology.map(({ p, quotes, i }, j) => {
    const s = support[`physiology.${i}`];
    delete support[`physiology.${i}`];
    if (s) support[`physiology.${j}`] = s;
    audit.findings_total++;
    audit.findings_with_evidence++;
    return { ...p, quotes };
  });

  const recipe = (text: string, quotes: string[], path: string) => {
    const q = keep(quotes, path);
    if (nonEmpty(text) && !q.length) audit.emptied++;
    return q.length ? { text, quotes: q } : { text: "", quotes: [] as string[] };
  };
  const peak = recipe(raw.state_recipes.peak, raw.state_recipes.peak_quotes, "state_recipes.peak");
  const crash = recipe(raw.state_recipes.crash, raw.state_recipes.crash_quotes, "state_recipes.crash");

  const language = dedupe(raw.language.filter((l) => nonEmpty(l.quote)), (l) => l.quote, 0.9)
    .map((l) => ({ l, ok: keep([l.quote], "__language").length > 0 }))
    .filter(({ ok }) => {
      if (!ok) audit.language_removed++;
      return ok;
    })
    .slice(0, LIMITS.language)
    .map(({ l }) => ({ ...l, quote: l.quote.trim().replace(/^["“”„«»']+|["“”„«»']+$/g, "") }));
  delete support.__language;
  // Sprogmønstrene får deres egne stier.
  language.forEach((l, i) => {
    const r = checkQuote(index, l.quote);
    if (r.status === "verified") support[`language.${i}`] = r.sessions;
  });

  const seenNeeds = new Set<string>();
  const needs = raw.needs
    .filter((n) => !seenNeeds.has(n.need) && seenNeeds.add(n.need))
    .slice(0, LIMITS.needs)
    .map((n, i) => settle(n, `needs.${i}`));

  const rules = dedupe(raw.rules.filter((r) => nonEmpty(r.rule)), (r) => r.rule)
    .slice(0, LIMITS.rules)
    .map((r, i) => settle(r, `rules.${i}`));

  const refList = (xs: { description: string; quotes: string[] }[], key: "capability" | "danger") =>
    xs
      .filter((x) => nonEmpty(x.description))
      .map((x, i) => ({ ...x, quotes: keep(x.quotes, `references.${key}.__${i}`), i }))
      .filter((x) => x.quotes.length > 0)
      .slice(0, LIMITS[key])
      .map(({ i, ...x }, j) => {
        support[`references.${key}.${j}`] = support[`references.${key}.__${i}`] ?? [];
        return x;
      });
  const capability = refList(raw.references.capability, "capability");
  const danger = refList(raw.references.danger, "danger");
  for (const k of Object.keys(support)) if (/\.__\d+$/.test(k)) delete support[k];

  const formativeQuotes = keep(raw.references.formative.quotes, "references.formative");
  if (!formativeQuotes.length && nonEmpty(raw.references.formative.description)) audit.emptied++;
  const formative = formativeQuotes.length
    ? { ...raw.references.formative, quotes: formativeQuotes }
    : { description: "", decision: "", quotes: [] as string[] };

  const howQuotes = keep(raw.how_it_lands.quotes, "how_it_lands");
  const tensionQuotes = keep(raw.tension.quotes, "tension");

  // Blinde vinkler: modellens + spørgsmål for de lag, der blev tømt.
  const blind = raw.blind_spots.filter((b) => nonEmpty(b.question));
  const add = (layer: MapLayer, question: string, why: string) => {
    if (!blind.some((b) => b.layer === layer)) blind.unshift({ layer, question, why });
  };
  if (!physiologyOut.length)
    add(
      "physiology",
      "Hvad gør du konkret med kroppen de sidste minutter, før du præsterer — holdning, vejrtrækning, musik, ritualer?",
      "Fysiologi kan ikke læses af tekst. Uden den mangler den tredje dør i modellen.",
    );
  if (!formative.description)
    add(
      "references",
      "Hvornår lærte du første gang det, du i dag gør automatisk her? Hvad skete der, og hvad besluttede du dér?",
      "Den formative reference forklarer, hvor reglen kommer fra, og hvad der skal til for at revidere den.",
    );

  audit.sessions_used = used.size;
  audit.precision = audit.findings_total ? Math.round((100 * audit.findings_with_evidence) / audit.findings_total) : 0;

  const map: ModelingMap = {
    core: raw.core.trim(),
    result_modeled: raw.result_modeled.trim(),
    source_basis: raw.source_basis.trim(),
    beliefs,
    syntax: { ...raw.syntax, steps },
    physiology: physiologyOut,
    state_recipes: { peak: peak.text, peak_quotes: peak.quotes, crash: crash.text, crash_quotes: crash.quotes },
    language,
    needs,
    rules,
    references: { formative, capability, danger, missing: raw.references.missing.trim() },
    how_it_lands: { ...raw.how_it_lands, quotes: howQuotes },
    do_not_copy: raw.do_not_copy.filter((d) => nonEmpty(d.item)).slice(0, LIMITS.do_not_copy),
    tension: { text: raw.tension.text.trim(), quotes: tensionQuotes },
    leverage: raw.leverage,
    installation: {
      ...raw.installation,
      actions: ACTION_KINDS.flatMap((k) => raw.installation.actions.filter((a) => a.kind === k && nonEmpty(a.action)).slice(0, 1)),
    },
    blind_spots: blind.slice(0, LIMITS.blind_spots),
  };

  return {
    map,
    support,
    audit,
    sessions: source.sessions.map(({ id, analysisId, title, date, included }) => ({ id, analysisId, title, date, included })),
    person: source.person,
  };
}

// ── Tekstbaseret kort (uden Claude) ──────────────────────────────────────────

const sentencesOf = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 260);

const PHYS_WORDS: [RegExp, PhysiologyKind][] = [
  [/vejrtrækning|træk(ker)? vejret|ånde/, "breath"],
  [/skuldre|holdning|ryg(gen)? |rank/, "posture"],
  [/søvn|sove|sover/, "sleep"],
  [/træning|træner mig|løb(er)? |svømme|motion/, "training"],
  [/sang|musik|ritual|hver gang|samme .* hver/, "ritual"],
  [/ryster|bevæg|går en tur/, "movement"],
  [/energi|let|tung|varme|krop/, "energy"],
  [/stemme/, "voice"],
];

const SUBMODALITY_WORDS =
  /\b(helt tydeligt|tydeligt|tydelig|klart|klar|stort|stor|lille|tæt på|langt væk|foran mig|lyst|mørkt|farver|varm|varme|kold|tung|let|hurtig|hurtigt|langsom|langsomt|rolig|roligt|højt|lavt|rytme|mærkeligt|pres)\b/gi;

/** Udsagn uden afsluttende tegn, så de kan stå i anførselstegn midt i en sætning. */
const bare = (s: string) => s.trim().replace(/[.!?]+$/, "");

function levelOf(statement: string): BeliefLevel {
  const s = statement.toLowerCase();
  if (/^jeg er\b|jeg er en (person|type)/.test(s)) return "identity";
  if (/^jeg kan\b|jeg er god til/.test(s)) return "capability";
  if (/\b(hvis|når)\b.*\b(så|bliver|er)\b/.test(s)) return "cause_effect";
  if (/\b(folk|andre|verden|man)\b/.test(s)) return "world";
  return "other";
}

/**
 * Det tekstbaserede modelleringskort: bygget af analysernes fund og personens
 * egne sætninger. Bruges af mock-provideren, offline og som fallback, når
 * Claude ikke kan svare. Går gennem samme verifikation som Claudes kort.
 */
export function heuristicModelingMap(source: ModelingSource): ModelingMap {
  const name = source.person.name || "Personen";
  const self = source.person.isSelf;
  const results = source.sessions.map((s) => s.result ?? generateMockAnalysis(s.transcript, { subjectName: name, goal: source.person.goal }));
  const latest = results[0]!;
  const said = source.sessions.flatMap((s) =>
    sentencesOf(
      parseTurns(s.transcript, name)
        .filter((t) => !t.interviewer)
        .map((t) => t.text)
        .join("\n"),
    ),
  );
  const find = (re: RegExp, n = 3) => said.filter((x) => re.test(x.toLowerCase())).slice(0, n);

  const enabling = results.flatMap((r) => r.enabling_beliefs.beliefs);
  const disenabling = results.flatMap((r) => r.disenabling_beliefs.beliefs);
  const beliefs = enabling
    .filter((b, i) => !enabling.slice(0, i).some((x) => similarity(x.statement, b.statement) > 0.7))
    .slice(0, 5)
    .map((b) => ({
      statement: b.statement,
      level: levelOf(b.statement),
      in_action: "",
      say_do: (b.evidence_type === "behavior" ? "done_only" : "said_only") as SayDo,
      transferable: true,
      quotes: b.quotes,
      evidence_type: b.evidence_type,
      confidence: b.confidence,
    }));

  const strategies = results.flatMap((r) => r.cognitive_strategies.strategies);
  const strategy = [...strategies].sort((a, b) => CONF_RANK[b.confidence] - CONF_RANK[a.confidence] || b.steps.length - a.steps.length)[0];
  const syntax: ModelingMap["syntax"] = strategy
    ? {
        name: strategy.name,
        trigger: strategy.trigger,
        steps: strategy.steps.map((s) => ({
          channel: s.system as RepSystem,
          direction: s.orientation,
          instruction: s.description,
          submodalities: [...new Set((s.quote.match(SUBMODALITY_WORDS) ?? []).map((w) => w.toLowerCase()))],
          quote: s.quote,
          evidence_type: (s.quote ? "quote" : "inference") as EvidenceType,
          confidence: (s.quote ? "medium" : "low") as Confidence,
        })),
        test: strategy.tote.test,
        exit: strategy.tote.exit,
        notation: strategy.notation,
        transferable: strategy.transferable,
      }
    : { name: "", trigger: "", steps: [], test: "", exit: "", notation: "", transferable: false };

  const physiology = PHYS_WORDS.flatMap(([re, kind]) => {
    const q = find(re, 1)[0];
    return q ? [{ text: q.replace(/[.!?]$/, ""), kind, quotes: [q], evidence_type: "quote" as const, confidence: "medium" as const }] : [];
  }).filter((p, i, xs) => xs.findIndex((x) => x.quotes[0] === p.quotes[0]) === i);

  const peakQ = find(/let|rolig|klar|varme i|falder ned|lukker alt ude/, 2);
  const crashQ = find(/pres|bange|stress|uro|går i stå|ikke sove|koster mig/, 2);

  const mm = results.flatMap((r) => [
    ...r.meaning_makers.metaphors.map((x) => ({ q: x.quote, kind: "metaphor" as LanguageKind, meaning: x.meaning })),
    ...r.meaning_makers.habitual_questions.map((x) => ({ q: x.quote, kind: "question" as LanguageKind, meaning: x.meaning })),
    ...r.meaning_makers.key_words.map((x) => ({ q: x.quote, kind: "catchphrase" as LanguageKind, meaning: x.meaning })),
  ]);
  const language = [
    ...find(/siger til mig selv|tænker: /, 2).map((q) => ({ quote: q, kind: "self_talk" as LanguageKind, reveals: "Selvtalen, der holder kursen." })),
    ...find(/(fejl|tab|nej|går galt).*bare|bare (information|feedback)/, 2).map((q) => ({
      quote: q,
      kind: "setback_frame" as LanguageKind,
      reveals: "Modgang rammes ind som information frem for som dom.",
    })),
    ...mm.filter((x) => nonEmpty(x.q)).map((x) => ({ quote: x.q, kind: x.kind, reveals: x.meaning })),
  ].slice(0, 5);

  const dominant = latest.values_and_6_human_needs.dominant_needs.slice(0, 2);
  const needs = dominant.map((n) => {
    const a = latest.values_and_6_human_needs.human_needs[n];
    return {
      need: n,
      how_fed: a.how_met || `Behovet for ${HUMAN_NEED_LABEL[n].toLowerCase()} fylder i måden, ${name} taler om sit arbejde.`,
      cost: a.cost,
      quotes: a.quotes,
      evidence_type: (a.quotes.length ? "quote" : "inference") as EvidenceType,
      confidence: a.confidence,
    };
  });

  const rules = find(/\b(altid|aldrig|hver dag|hver gang|regel|skal have)\b/, 4).map((q) => {
    const l = q.toLowerCase();
    const kind: RuleKind = /aldrig/.test(l) ? "never" : /altid|hver dag|hver gang/.test(l) ? "always" : /skal/.test(l) ? "must" : "standard";
    return { rule: q.replace(/[.!?]$/, ""), kind, quotes: [q], evidence_type: "quote" as const, confidence: "medium" as const };
  });

  const formativeQ = find(/\b(da jeg|engang|som barn|første gang|husker)\b/, 1);
  const capQ = find(/lykkedes|vandt|klarede|fået .* tilbage|vokser|virker/, 2);
  const dangerQ = find(/bange|skuffe|fejl|gik galt|fiasko|går jeg glip/, 2);
  const topD = disenabling[0];

  const mp = latest.meta_programs.programs;
  const pole = (id: string) => mp.find((p) => p.program === id);
  const chunk = pole("general_specific");
  const dir = pole("toward_away");
  const conv = latest.meta_programs.convincer;

  const topE = beliefs[0];
  const goal = source.person.goal || latest.summary.result_modeled;
  const you = self ? "du" : name;
  const needWord = dominant[0] ? HUMAN_NEED_LABEL[dominant[0]].toLowerCase() : "vækst";

  return {
    core: topE
      ? `${self ? "Du" : name} er bygget op omkring “${topE.statement.replace(/[.!]+$/, "")}”${dominant.length ? `, drevet af ${dominant.map((n) => HUMAN_NEED_LABEL[n].toLowerCase()).join(" og ")}` : ""}.`
      : `For lidt materiale til at sige, hvad ${you} er bygget op omkring.`,
    result_modeled: latest.summary.result_modeled || goal,
    source_basis: `${source.sessions.length} ${source.sessions.length === 1 ? "samtale" : "samtaler"} med ${name}. Tekstbaseret kort uden Claude: fundene kommer fra analyserne, citaterne fra transskripterne.`,
    beliefs,
    syntax,
    physiology,
    state_recipes: {
      peak: peakQ.length ? `Det, ${you} selv beskriver, når det kører: ${peakQ.map((q) => q.replace(/[.!?]$/, "").toLowerCase()).join("; ")}.` : "",
      peak_quotes: peakQ,
      crash: crashQ.length ? `Det, der trækker ned: ${crashQ.map((q) => q.replace(/[.!?]$/, "").toLowerCase()).join("; ")}.` : "",
      crash_quotes: crashQ,
    },
    language,
    needs,
    rules,
    references: {
      formative: formativeQ.length ? { description: formativeQ[0]!, decision: "", quotes: formativeQ } : { description: "", decision: "", quotes: [] },
      capability: capQ.map((q) => ({ description: q.replace(/[.!?]$/, ""), quotes: [q] })),
      danger: dangerQ.map((q) => ({ description: q.replace(/[.!?]$/, ""), quotes: [q] })),
      missing: topD ? `Bevis for det modsatte af “${bare(topD.statement)}”.` : "",
    },
    how_it_lands: {
      chunk_size: chunk ? (chunk.leaning === "pole_a" ? "global" : chunk.leaning === "pole_b" ? "specific" : "mixed") : "unknown",
      direction: dir ? (dir.leaning === "pole_a" ? "toward" : dir.leaning === "pole_b" ? "away_from" : "mixed") : "unknown",
      convincer: nonEmpty(conv.description) ? conv.description : "",
      advice: dir?.leaning === "pole_b" ? `Tal om, hvad ${you} undgår, før du taler om, hvad der kan vindes.` : `Tal om, hvad ${you} bevæger sig hen imod, og vis det konkret.`,
      quotes: conv.quotes,
    },
    do_not_copy: [],
    tension: topD && topE ? { text: `“${bare(topE.statement)}” trækker frem, mens “${bare(topD.statement)}” holder igen.`, quotes: [...topD.quotes.slice(0, 1)] } : { text: "", quotes: [] },
    leverage: topD
      ? {
          point: `Byg én ny reference, der modsiger “${bare(topD.statement)}”.`,
          why: topD.cost || topD.impact,
          moves_with: "Når den begrænsende overbevisning løsner sig, ændrer både fysiologien og sproget sig typisk med.",
        }
      : topE
        ? { point: `Gør mere af det, der allerede virker: “${bare(topE.statement)}”.`, why: topE.statement, moves_with: "Syntaksen og overbevisningen forstærker hinanden." }
        : { point: "", why: "", moves_with: "" },
    installation: {
      result: goal ? `${goal} — mål det konkret inden for 30 dage.` : `Kør strategien “${syntax.name || "den vigtigste sekvens"}” i tre rigtige situationer inden for 14 dage.`,
      purpose: `Det giver ${self ? "dig" : "dig, som modellerer"} mere ${needWord} — grunden til, at gentagelserne bliver til at holde ud.`,
      actions: [
        ...(topE ? [{ kind: "belief_evidence" as const, action: `Gør én ting i denne uge, der giver dig bevis for: “${bare(topE.statement)}”.`, trigger: "Næste gang du tøver." }] : []),
        ...(syntax.steps.length ? [{ kind: "syntax_practice" as const, action: `Kør sekvensen ${syntax.notation || syntax.name} trin for trin.`, trigger: syntax.trigger || "Før næste vigtige beslutning." }] : []),
        ...(physiology[0] ? [{ kind: "physiology_habit" as const, action: `Indfør fra i dag: ${physiology[0].text.toLowerCase()}.`, trigger: "Hver gang før du præsterer." }] : []),
      ],
      focus: topE ? `Denne uge: kun beviset for “${bare(topE.statement)}”. Fortæl én person, hvad du vil gøre, og hvornår.` : "",
      mastery_note: "30-dages-tjekket måler, om det er begyndt at føles sandt (følelsesmæssig mestring) — ikke om det kører af sig selv. Det tager måneder.",
      resistance: source.installer?.disenabling[0] ? `Din egen overbevisning “${bare(source.installer.disenabling[0])}” vil sandsynligvis gøre modstand.` : "",
    },
    blind_spots: results
      .flatMap((r) => r.gaps_and_next_questions.next_questions)
      .slice(0, 4)
      .map((q) => ({
        question: q.question,
        layer: ((
          {
            cognitive_strategies: "syntax",
            enabling_beliefs: "beliefs",
            disenabling_beliefs: "beliefs",
            values_and_6_human_needs: "needs",
            meta_programs: "how_it_lands",
            meaning_makers: "language",
            vakog: "syntax",
            eye_accessing_cues: "physiology",
          } as Record<string, MapLayer>
        )[q.target_category] ?? "other") as MapLayer,
        why: q.purpose,
      })),
  };
}

// ── Rapport (Markdown, PDF, web og artifact deler blokkene) ──────────────────

const CONF_TONE: Record<Confidence, Tone> = { low: "warning", medium: "neutral", high: "positive" };

function evidence(item: { evidence_type: EvidenceType; confidence: Confidence }, seen?: string[]): Badge[] {
  return [
    { text: EVIDENCE_LABEL[item.evidence_type], tone: item.evidence_type === "inference" ? "info" : "neutral" },
    { text: CONFIDENCE_LABEL[item.confidence], tone: CONF_TONE[item.confidence] },
    ...(seen && seen.length > 1 ? [{ text: `Går igen i ${seen.length} samtaler`, tone: "positive" as Tone }] : []),
  ];
}

const empty = (text: string): ReportBlock => ({ type: "callout", tone: "info", text });

export interface ModelingReportInfo {
  generatedAt?: string;
  model?: string;
  sourceLabel?: string;
}

/** Danske overskrifter i kortets rækkefølge (bruges også af UI'et). */
export const MODELING_SECTIONS = [
  { key: "core", title: "Kernen", description: "Hvad personen er bygget op omkring, sagt lige ud." },
  { key: "beliefs", title: "Overbevisninger", description: "Kommandoer til nervesystemet: det, personen holder for sandt, og hvordan det ses i handling." },
  { key: "syntax", title: "Mental syntaks", description: "Strategien trin for trin, så konkret at den kan køres i morgen." },
  { key: "physiology", title: "Fysiologi og tilstand", description: "Krop, energi og ritualer, kun det der er beskrevet, plus opskrifterne på top og fald." },
  { key: "language", title: "Sprogmønstre", description: "Vendinger, metaforer og selvtale, ordret." },
  { key: "needs", title: "De seks behov", description: "De to dominerende behov, og hvordan mønstrene fodrer dem." },
  { key: "rules", title: "Regler og standarder", description: "Det, personen altid eller aldrig gør." },
  { key: "references", title: "Referenceoplevelser", description: "Beviserne: den formative oplevelse, bevis på kapacitet og fare, og den manglende reference." },
  { key: "how_it_lands", title: "Sådan lander det hos personen", description: "Chunk size, retning og convincer: hvordan man taler, så det går ind." },
  { key: "do_not_copy", title: "Det, du ikke skal kopiere", description: "Det kontekstuelle, det heldige og det, der koster andre steder." },
  { key: "leverage", title: "Spændingen og millimeteren", description: "Hvor energien sidder fanget, og det ene sted, hvor en lille justering flytter resten." },
  { key: "installation", title: "Installationsplan (RPM)", description: "Resultat, formål og massiv handlingsplan, med ét fokus ad gangen." },
  { key: "blind_spots", title: "Blinde vinkler", description: "Det, materialet ikke viser, og de spørgsmål, der lukker hullerne." },
  { key: "precision", title: "Præcision", description: "Hvor meget af kortet, der står på ordrette citater fra transskripterne." },
] as const;
export type ModelingSectionKey = (typeof MODELING_SECTIONS)[number]["key"];

const seenText = (r: ModelingMapResult, path: string) => {
  const s = r.support[path];
  if (!s?.length) return undefined;
  return s.map((id) => r.sessions.find((x) => x.id === id)?.title ?? id).join(", ");
};

export function modelingSectionBlocks(r: ModelingMapResult): Record<ModelingSectionKey, ReportBlock[]> {
  const m = r.map;
  // "Belæg fra" giver kun mening, når kortet bygger på flere samtaler.
  const seenDetail = (path: string) => {
    if (r.sessions.length < 2) return [];
    const t = seenText(r, path);
    return t ? [{ label: "Belæg fra", value: t }] : [];
  };
  const a = r.audit;

  return {
    core: [
      ...(nonEmpty(m.core) ? [{ type: "callout" as const, tone: "info" as Tone, title: "Kernen", text: m.core }] : []),
      {
        type: "keyvalue",
        items: [
          ...(nonEmpty(m.result_modeled) ? [{ label: "Resultatet der modelleres", value: m.result_modeled }] : []),
          ...(nonEmpty(m.source_basis) ? [{ label: "Kildegrundlag", value: m.source_basis }] : []),
        ],
      },
    ],
    beliefs: m.beliefs.length
      ? [
          {
            type: "items",
            items: m.beliefs.map((b, i): ReportItem => ({
              title: b.statement,
              badges: [
                { text: BELIEF_LEVEL_LABEL[b.level], tone: b.level === "identity" ? "positive" : "neutral" },
                { text: SAY_DO_LABEL[b.say_do], tone: b.say_do === "both" ? "positive" : b.say_do === "conflict" ? "warning" : "neutral" },
                ...evidence(b, r.support[`beliefs.${i}`]),
                ...(b.transferable ? [] : [{ text: "Kontekstbundet", tone: "warning" as Tone }]),
              ],
              details: [...(nonEmpty(b.in_action) ? [{ label: "I handling", value: b.in_action }] : []), ...seenDetail(`beliefs.${i}`)],
              quotes: b.quotes,
            })),
          },
        ]
      : [empty("Ingen overbevisninger med belæg i materialet.")],
    syntax: m.syntax.steps.length
      ? [
          ...(nonEmpty(m.syntax.name) ? [{ type: "subheading" as const, text: m.syntax.name }] : []),
          {
            type: "flow",
            title: m.syntax.notation || "Sekvensen",
            steps: [
              ...(nonEmpty(m.syntax.trigger) ? [{ label: "Udløser", caption: m.syntax.trigger }] : []),
              ...m.syntax.steps.map((s, i) => ({ label: `${i + 1}. ${s.channel === "action" ? "Handling" : `${s.channel}${s.direction === "internal" ? "ⁱ" : "ᵉ"}`}`, caption: s.instruction })),
            ],
          },
          {
            type: "items",
            items: m.syntax.steps.map((s, i): ReportItem => ({
              title: `${i + 1}. ${s.instruction}`,
              badges: [{ text: SYNTAX_CHANNEL_LABEL[s.channel], tone: "info" }, ...evidence(s)],
              details: [
                ...(s.submodalities.length ? [{ label: "Submodaliteter (egne ord)", value: s.submodalities.join(" · ") }] : []),
                ...seenDetail(`syntax.steps.${i}`),
              ],
              quotes: s.quote ? [s.quote] : [],
            })),
          },
          {
            type: "keyvalue",
            items: [
              ...(nonEmpty(m.syntax.test) ? [{ label: "Test", value: m.syntax.test }] : []),
              ...(nonEmpty(m.syntax.exit) ? [{ label: "Exit", value: m.syntax.exit }] : []),
              { label: "Overførbar", value: m.syntax.transferable ? "Ja" : "Nej, hænger på kontekst" },
            ],
          },
        ]
      : [empty("Sekvensen kan ikke læses af materialet. Se blinde vinkler.")],
    physiology: [
      ...(m.physiology.length
        ? [
            {
              type: "items" as const,
              items: m.physiology.map((p, i): ReportItem => ({
                title: p.text,
                badges: [{ text: PHYSIOLOGY_KIND_LABEL[p.kind], tone: "info" }, ...evidence(p, r.support[`physiology.${i}`])],
                details: seenDetail(`physiology.${i}`),
                quotes: p.quotes,
              })),
            },
          ]
        : [empty("Fysiologi fremgår ikke af materialet, og den udledes aldrig af tekst alene.")]),
      {
        type: "items",
        items: [
          { title: "Topopskriften", body: m.state_recipes.peak || "Fremgår ikke af materialet.", quotes: m.state_recipes.peak_quotes, badges: [{ text: "Peak", tone: "positive" }] },
          { title: "Faldopskriften", body: m.state_recipes.crash || "Fremgår ikke af materialet.", quotes: m.state_recipes.crash_quotes, badges: [{ text: "Crash", tone: "warning" }] },
        ],
      },
    ],
    language: m.language.length
      ? [
          {
            type: "items",
            items: m.language.map((l, i): ReportItem => ({
              title: `“${l.quote}”`,
              body: l.reveals,
              badges: [{ text: LANGUAGE_KIND_LABEL[l.kind], tone: "info" }],
              details: seenDetail(`language.${i}`),
            })),
          },
        ]
      : [empty("Ingen ordrette sprogmønstre fundet.")],
    needs: m.needs.length
      ? [
          {
            type: "items",
            items: m.needs.map((n, i): ReportItem => ({
              title: HUMAN_NEED_LABEL[n.need],
              body: n.how_fed,
              badges: evidence(n, r.support[`needs.${i}`]),
              details: [...(nonEmpty(n.cost) ? [{ label: "Pris", value: n.cost }] : []), ...seenDetail(`needs.${i}`)],
              quotes: n.quotes,
            })),
          },
        ]
      : [empty("De dominerende behov kan ikke afgøres af materialet.")],
    rules: m.rules.length
      ? [
          {
            type: "items",
            items: m.rules.map((x, i): ReportItem => ({
              title: x.rule,
              badges: [{ text: RULE_KIND_LABEL[x.kind], tone: "neutral" }, ...evidence(x, r.support[`rules.${i}`])],
              details: seenDetail(`rules.${i}`),
              quotes: x.quotes,
            })),
          },
        ]
      : [empty("Ingen regler med belæg.")],
    references: [
      {
        type: "items",
        items: [
          m.references.formative.description
            ? {
                title: m.references.formative.description,
                body: m.references.formative.decision ? `Meningen, der blev truffet: ${m.references.formative.decision}` : undefined,
                badges: [{ text: "Formativ reference", tone: "info" }],
                details: seenDetail("references.formative"),
                quotes: m.references.formative.quotes,
              }
            : { title: "Den formative reference fremgår ikke af materialet.", badges: [{ text: "Formativ reference", tone: "info" }] },
          ...m.references.capability.map((x, i): ReportItem => ({
            title: x.description,
            badges: [{ text: "Bevis på kapacitet", tone: "positive" }],
            details: seenDetail(`references.capability.${i}`),
            quotes: x.quotes,
          })),
          ...m.references.danger.map((x, i): ReportItem => ({
            title: x.description,
            badges: [{ text: "Bevis på fare", tone: "warning" }],
            details: seenDetail(`references.danger.${i}`),
            quotes: x.quotes,
          })),
        ],
      },
      ...(nonEmpty(m.references.missing) ? [{ type: "callout" as const, tone: "warning" as Tone, title: "Den manglende reference", text: m.references.missing }] : []),
    ],
    how_it_lands: [
      {
        type: "keyvalue",
        items: [
          { label: "Chunk size", value: CHUNK_SIZE_LABEL[m.how_it_lands.chunk_size] },
          { label: "Retning", value: DIRECTION_LABEL[m.how_it_lands.direction] },
          { label: "Convincer", value: m.how_it_lands.convincer || "Fremgår ikke" },
        ],
      },
      ...(nonEmpty(m.how_it_lands.advice) ? [{ type: "paragraph" as const, text: m.how_it_lands.advice }] : []),
      ...m.how_it_lands.quotes.map((q) => ({ type: "quote" as const, text: q })),
    ],
    do_not_copy: m.do_not_copy.length
      ? [
          {
            type: "items",
            items: m.do_not_copy.map((d): ReportItem => ({ title: d.item, body: d.explanation, badges: [{ text: NOT_COPY_REASON_LABEL[d.reason], tone: "warning" }] })),
          },
        ]
      : [empty("Materialet viser ikke noget, der tydeligt er held, kontekst eller pris.")],
    leverage: [
      ...(nonEmpty(m.tension.text) ? [{ type: "callout" as const, tone: "warning" as Tone, title: "Spændingen", text: m.tension.text }] : []),
      ...m.tension.quotes.map((q) => ({ type: "quote" as const, text: q })),
      ...(nonEmpty(m.leverage.point)
        ? [
            { type: "callout" as const, tone: "positive" as Tone, title: "Millimeteren", text: m.leverage.point },
            {
              type: "keyvalue" as const,
              items: [
                ...(nonEmpty(m.leverage.why) ? [{ label: "Hvorfor netop dér", value: m.leverage.why }] : []),
                ...(nonEmpty(m.leverage.moves_with) ? [{ label: "Flytter med", value: m.leverage.moves_with }] : []),
              ],
            },
          ]
        : [empty("Intet leverage-punkt med belæg endnu.")]),
    ],
    installation: [
      {
        type: "keyvalue",
        items: [
          ...(nonEmpty(m.installation.result) ? [{ label: "Resultat", value: m.installation.result }] : []),
          ...(nonEmpty(m.installation.purpose) ? [{ label: "Formål", value: m.installation.purpose }] : []),
        ],
      },
      ...(m.installation.actions.length
        ? [
            {
              type: "items" as const,
              items: m.installation.actions.map((x, i): ReportItem => ({
                title: `${i + 1}. ${x.action}`,
                badges: [{ text: ACTION_KIND_LABEL[x.kind], tone: "info" }],
                details: nonEmpty(x.trigger) ? [{ label: "Udløser", value: x.trigger }] : [],
              })),
            },
          ]
        : []),
      ...(nonEmpty(m.installation.focus) ? [{ type: "callout" as const, tone: "positive" as Tone, title: "Koncentrationsprincip", text: m.installation.focus }] : []),
      ...(nonEmpty(m.installation.mastery_note) ? [{ type: "callout" as const, tone: "info" as Tone, title: "Mestringstempo", text: m.installation.mastery_note }] : []),
      ...(nonEmpty(m.installation.resistance) ? [{ type: "callout" as const, tone: "warning" as Tone, title: "Forventet modstand", text: m.installation.resistance }] : []),
    ],
    blind_spots: m.blind_spots.length
      ? [
          {
            type: "items",
            items: m.blind_spots.map((b): ReportItem => ({ title: b.question, body: b.why, badges: [{ text: MAP_LAYER_LABEL[b.layer], tone: "neutral" }] })),
          },
        ]
      : [empty("Ingen væsentlige huller.")],
    precision: [
      {
        type: "keyvalue",
        items: [
          { label: "Fund med ordret belæg", value: `${a.findings_with_evidence} af ${a.findings_total} (${a.precision} %)` },
          { label: "Citater fundet ordret", value: `${a.quotes_verified} af ${a.quotes_total}` },
          { label: "Samtaler med belæg", value: `${a.sessions_used} af ${a.sessions_total}` },
          ...(a.quotes_removed ? [{ label: "Citater fjernet", value: `${a.quotes_removed}${a.interviewer_quotes ? ` (heraf ${a.interviewer_quotes} sagt af intervieweren)` : ""}` }] : []),
          ...(a.downgraded ? [{ label: "Fund sat ned til lav sikkerhed", value: String(a.downgraded) }] : []),
          ...(a.physiology_removed ? [{ label: "Fysiologi uden belæg fjernet", value: String(a.physiology_removed) }] : []),
          ...(a.submodalities_removed ? [{ label: "Submodaliteter, der ikke var personens egne ord", value: String(a.submodalities_removed) }] : []),
        ],
      },
      {
        type: "table",
        headers: ["Samtale", "Titel", "Dato", "Med i grundlaget"],
        rows: r.sessions.map((s) => [s.id, s.title, s.date, s.included === "full" ? "Hele" : s.included === "partial" ? "Delvist" : "Nej (over tegnbudgettet)"]),
      },
    ],
  };
}

export function buildModelingReport(r: ModelingMapResult, info: ModelingReportInfo = {}): ReportDocument {
  const blocks = modelingSectionBlocks(r);
  const sections: ReportSection[] = MODELING_SECTIONS.map((s) => ({ key: s.key, title: s.title, description: s.description, blocks: blocks[s.key] }));
  return {
    title: `Modelleringskort: ${r.person.name}`,
    subtitle: "Gustavs metode — overbevisninger, mental syntaks og fysiologi oven på de seks behov",
    generatedAt: info.generatedAt ?? new Date().toISOString(),
    meta: [
      { label: "Person", value: r.person.name },
      ...(r.person.domain ? [{ label: "Domæne", value: r.person.domain }] : []),
      { label: "Samtaler", value: String(r.sessions.length) },
      { label: "Præcision", value: `${r.audit.precision} % af fundene står på ordrette citater` },
      ...(info.model ? [{ label: "Model", value: info.model }] : []),
      ...(info.sourceLabel ? [{ label: "Kilde", value: info.sourceLabel }] : []),
    ],
    sections,
  };
}

/** Antal fund i kortet (til lister og nøgletal). */
export function modelingFindingCount(m: ModelingMap): number {
  return m.beliefs.length + m.syntax.steps.length + m.physiology.length + m.language.length + m.needs.length + m.rules.length;
}
