import { z } from "zod";
import { BELIEF_TYPE_LABEL } from "../categories/beliefs";
import { HUMAN_NEEDS, type HumanNeedKey } from "../schema/common";
import { HUMAN_NEED_LABEL } from "../schema/labels";
import type { AnalysisRecord } from "./aggregate";
import { needsInText } from "./need-lexicon";
import { similarity, tokens } from "./text-similarity";

/**
 * Overbevisnings-match: hver gang en ny analyse er færdig, sammenlignes
 * personens overbevisninger med alle andre personer i biblioteket — begge veje:
 *  - hvilke af de andres styrkende overbevisninger passer til den nye person
 *  - hvilke af den nye persons styrkende overbevisninger passer til de andre
 *  - hvilke overbevisninger de allerede deler
 *
 * Modulet er rent (ingen LLM): inventar → (Claude eller heuristik) → rå match
 * med id'er → `resolveMatches()` slår id'erne op igen, så udsagn og citater
 * altid kommer fra de gemte analyser og aldrig fra modellens hukommelse.
 */

export const MATCH_KINDS = ["shared", "counter", "fit"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export const MATCH_KIND_LABEL: Record<MatchKind, string> = {
  shared: "Fælles",
  counter: "Modvægt",
  fit: "Passer til",
};

export const MATCH_KIND_DESCRIPTION: Record<MatchKind, string> = {
  shared: "De har allerede en beslægtet overbevisning.",
  counter: "En styrkende overbevisning, der kan opløse en begrænsende hos modtageren.",
  fit: "En styrkende overbevisning, der passer til modtagerens værdier, behov eller mål.",
};

export type BeliefKind = "enabling" | "disenabling";
export type AnchorType = "enabling_belief" | "disenabling_belief" | "value" | "need" | "goal" | "none";

export const ANCHOR_TYPE_LABEL: Record<AnchorType, string> = {
  enabling_belief: "Styrkende overbevisning",
  disenabling_belief: "Begrænsende overbevisning",
  value: "Værdi",
  need: "Behov",
  goal: "Mål",
  none: "",
};

// ── Inventar (det, der sendes til Claude) ────────────────────────────────────

export interface InventoryBelief {
  id: string;
  kind: BeliefKind;
  type: string;
  statement: string;
  impact: string;
  cost: string;
  quote: string;
  /** Kun lokalt (fjernes før afsendelse): hvilken analyse fundet stammer fra. */
  analysisId?: string;
}

export interface InventoryPerson {
  id: string;
  name: string;
  domain: string;
  goal: string;
  dominant_needs: HumanNeedKey[];
  values: { id: string; value: string; direction: "toward" | "away_from" }[];
  beliefs: InventoryBelief[];
  /** Kun lokalt. */
  key?: string;
  expertId?: string | null;
  latestAnalysisId?: string;
}

export interface BeliefInventory {
  /** Id på personen, hvis nye analyse udløste matchet (fx "P1"). */
  target: string;
  persons: InventoryPerson[];
}

/** En analyse + hvem den tilhører. Nyeste først giver de nyeste formuleringer. */
export interface PersonRecord extends AnalysisRecord {
  /** Stabil personnøgle (ekspert-id, ellers navnet). */
  personKey?: string;
  domain?: string;
}

export const personKeyOf = (r: Pick<PersonRecord, "personKey" | "expertId" | "expertName" | "result">) =>
  r.personKey ?? r.expertId ?? `anon:${(r.expertName || r.result.summary.subject || "ukendt").trim().toLowerCase()}`;

const MAX_BELIEFS_PER_KIND = 8;
const MAX_VALUES = 6;

/**
 * Samler én persons fund på tværs af alle vedkommendes analyser (nyeste
 * først). Næsten-ens overbevisninger slås sammen, så inventaret ikke gentager sig.
 */
export function buildPerson(id: string, records: PersonRecord[], opts: { presorted?: boolean } = {}): InventoryPerson {
  const sorted = opts.presorted ? records : [...records].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const newest = sorted[0]!;
  const beliefs: InventoryBelief[] = [];
  for (const kind of ["enabling", "disenabling"] as const) {
    const picked: InventoryBelief[] = [];
    for (const r of sorted) {
      const list = kind === "enabling" ? r.result.enabling_beliefs.beliefs : r.result.disenabling_beliefs.beliefs;
      for (const b of list) {
        if (picked.length >= MAX_BELIEFS_PER_KIND) break;
        if (picked.some((p) => similarity(p.statement, b.statement) >= 0.6)) continue;
        picked.push({
          id: `${id}.${kind === "enabling" ? "E" : "D"}${picked.length + 1}`,
          kind,
          type: b.belief_type,
          statement: b.statement,
          impact: b.impact,
          cost: "cost" in b ? (b as { cost: string }).cost : "",
          quote: b.quotes[0] ?? "",
          analysisId: r.id,
        });
      }
    }
    beliefs.push(...picked);
  }
  const values: InventoryPerson["values"] = [];
  for (const r of sorted) {
    for (const v of [...r.result.values_and_6_human_needs.values].sort((a, b) => a.rank - b.rank)) {
      if (values.length >= MAX_VALUES) break;
      if (values.some((x) => similarity(x.value, v.value) >= 0.6 || x.value.toLowerCase() === v.value.toLowerCase())) continue;
      values.push({ id: `${id}.V${values.length + 1}`, value: v.value, direction: v.direction });
    }
  }
  const s = newest.result.summary;
  return {
    id,
    name: (newest.expertName || s.subject || "Ukendt").trim(),
    domain: newest.domain ?? "",
    goal: s.result_modeled ?? "",
    dominant_needs: newest.result.values_and_6_human_needs.dominant_needs,
    values,
    beliefs,
    key: personKeyOf(newest),
    expertId: newest.expertId ?? null,
    latestAnalysisId: newest.id,
  };
}

/**
 * Bygger inventaret: målpersonen (den nye analyses person, med hele sin
 * historik) som P1 og alle andre personer som P2, P3, …
 */
export function buildInventory(
  target: { analysisId: string; records: PersonRecord[] },
  others: PersonRecord[],
  opts: { maxOthers?: number } = {},
): BeliefInventory {
  const targetRecs = target.records;
  const targetKey = personKeyOf(targetRecs.find((r) => r.id === target.analysisId) ?? targetRecs[0]!);
  // Den nye analyse forrest, derefter nyeste først, så dens formuleringer vinder ved dubletter.
  const ordered = [...targetRecs].sort(
    (a, b) => Number(b.id === target.analysisId) - Number(a.id === target.analysisId) || +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const p1 = buildPerson("P1", ordered, { presorted: true });

  const groups = new Map<string, PersonRecord[]>();
  for (const r of others) {
    const k = personKeyOf(r);
    if (k === targetKey) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const people = [...groups.values()]
    .sort((a, b) => Math.max(...b.map((r) => +new Date(r.createdAt))) - Math.max(...a.map((r) => +new Date(r.createdAt))))
    .slice(0, opts.maxOthers ?? 15)
    .map((recs, i) => buildPerson(`P${i + 2}`, recs));
  return { target: "P1", persons: [p1, ...people] };
}

/** Inventaret i den form, der sendes til modellen (uden lokale felter). */
export function publicInventory(inv: BeliefInventory): BeliefInventory {
  return {
    target: inv.target,
    persons: inv.persons.map((p) => ({
      id: p.id,
      name: p.name,
      domain: p.domain,
      goal: p.goal,
      dominant_needs: p.dominant_needs,
      values: p.values,
      beliefs: p.beliefs.map(({ analysisId: _a, ...b }) => b),
    })),
  };
}

// ── Schema for svaret ────────────────────────────────────────────────────────

export const RawBeliefMatchSchema = z.object({
  belief_id: z.string().describe("Id på den overbevisning, der matches, fx 'P2.E1'. Skal findes i inventaret."),
  to_person: z.string().describe("Id på den person, overbevisningen passer til, fx 'P1'. Aldrig ejeren af overbevisningen."),
  kind: z
    .enum(MATCH_KINDS)
    .describe(
      "shared = modtageren har allerede en beslægtet overbevisning (også fælles begrænsninger); counter = en styrkende overbevisning, der er en direkte modvægt til en af modtagerens begrænsende overbevisninger; fit = en styrkende overbevisning, der passer til modtagerens værdier, behov eller mål",
    ),
  anchor_id: z
    .string()
    .describe(
      "Id på det hos modtageren, matchet bygger på: en overbevisning ('P1.D1'), en værdi ('P1.V2'), et behov ('P1.N.growth') eller målet ('P1.G'). Tom streng hvis intet konkret.",
    ),
  fit: z.number().min(0).max(100).describe("Hvor godt overbevisningen passer til modtageren, 0-100"),
  rationale: z.string().describe("1-2 sætninger på dansk: hvorfor den passer, med henvisning til modtagerens egne fund"),
  bridge_question: z
    .string()
    .describe("Ét åbent spørgsmål på dansk, modtageren kan stille sig selv for at prøve overbevisningen på. Tom streng ved shared."),
});
export type RawBeliefMatch = z.infer<typeof RawBeliefMatchSchema>;

export const BeliefMatchResponseSchema = z.object({
  matches: z.array(RawBeliefMatchSchema),
  summary: z.string().describe("2-3 sætninger på dansk om de vigtigste match for målpersonen"),
});
export type BeliefMatchResponse = z.infer<typeof BeliefMatchResponseSchema>;

// ── Opløste match (det, der gemmes og vises) ─────────────────────────────────

export interface MatchParty {
  personKey: string;
  name: string;
  expertId: string | null;
  /** Analysen, fundet stammer fra (for modtageren: den analyse ankeret kommer fra). */
  analysisId: string;
}

export interface BeliefMatch {
  kind: MatchKind;
  fit: number;
  from: MatchParty;
  to: MatchParty;
  belief: { kind: BeliefKind; type: string; statement: string; impact: string; quote: string };
  anchor: { type: AnchorType; text: string };
  rationale: string;
  bridgeQuestion: string;
}

export type MatchSource = "claude" | "heuristic";

const MAX_PER_DIRECTION = 4;
const MAX_TOTAL = 40;
const MIN_FIT = 45;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * Slår id'erne i et rå svar op i inventaret og håndhæver reglerne lokalt:
 * ukendte id'er droppes, en person matches aldrig med sig selv, mindst én part
 * er målpersonen, begrænsende overbevisninger overføres aldrig (kun "fælles"),
 * og en "modvægt" skal pege på en begrænsende overbevisning hos modtageren.
 */
export function resolveMatches(inv: BeliefInventory, raw: RawBeliefMatch[]): BeliefMatch[] {
  const persons = new Map(inv.persons.map((p) => [p.id, p]));
  const beliefs = new Map(inv.persons.flatMap((p) => p.beliefs.map((b) => [b.id, { p, b }] as const)));
  const seen = new Set<string>();
  const perDirection = new Map<string, number>();
  const out: BeliefMatch[] = [];

  for (const m of [...raw].sort((a, b) => b.fit - a.fit)) {
    const src = beliefs.get(m.belief_id.trim());
    const to = persons.get(m.to_person.trim());
    if (!src || !to || to.id === src.p.id) continue;
    if (src.p.id !== inv.target && to.id !== inv.target) continue;
    const key = `${src.b.id}>${to.id}`;
    if (seen.has(key)) continue;

    let kind = m.kind;
    const anchor = resolveAnchor(to, m.anchor_id.trim());
    // "Fælles" er symmetrisk: A's udsagn ~ B's udsagn vises kun én gang.
    const pairKey = `shared:${[src.b.id, m.anchor_id.trim()].sort().join("|")}`;
    if (kind === "shared" && seen.has(pairKey)) continue;
    if (src.b.kind === "disenabling") {
      if (kind !== "shared" || anchor.type !== "disenabling_belief") continue;
    } else if (kind === "counter" && anchor.type !== "disenabling_belief") {
      kind = "fit";
    } else if (kind === "shared" && anchor.type !== "enabling_belief") {
      kind = "fit";
    }
    const fit = clamp(m.fit);
    if (fit < MIN_FIT) continue;
    const dir = `${src.p.id}>${to.id}`;
    if ((perDirection.get(dir) ?? 0) >= MAX_PER_DIRECTION) continue;
    perDirection.set(dir, (perDirection.get(dir) ?? 0) + 1);
    seen.add(key);
    if (kind === "shared") seen.add(pairKey);

    out.push({
      kind,
      fit,
      from: party(src.p, src.b.analysisId),
      to: party(to, anchor.analysisId),
      belief: { kind: src.b.kind, type: src.b.type, statement: src.b.statement, impact: src.b.impact, quote: src.b.quote },
      anchor: { type: anchor.type, text: anchor.text },
      rationale: m.rationale.trim(),
      bridgeQuestion: kind === "shared" ? "" : m.bridge_question.trim(),
    });
    if (out.length >= MAX_TOTAL) break;
  }
  return out;
}

function party(p: InventoryPerson, analysisId?: string): MatchParty {
  return { personKey: p.key ?? p.id, name: p.name, expertId: p.expertId ?? null, analysisId: analysisId ?? p.latestAnalysisId ?? "" };
}

function resolveAnchor(p: InventoryPerson, id: string): { type: AnchorType; text: string; analysisId?: string } {
  if (!id) return { type: "none", text: "" };
  const b = p.beliefs.find((x) => x.id === id);
  if (b) return { type: b.kind === "enabling" ? "enabling_belief" : "disenabling_belief", text: b.statement, analysisId: b.analysisId };
  const v = p.values.find((x) => x.id === id);
  if (v) return { type: "value", text: v.value };
  const need = id.startsWith(`${p.id}.N.`) ? id.slice(p.id.length + 3) : "";
  if ((HUMAN_NEEDS as readonly string[]).includes(need)) return { type: "need", text: HUMAN_NEED_LABEL[need as HumanNeedKey] };
  if (id === `${p.id}.G` && p.goal) return { type: "goal", text: p.goal };
  return { type: "none", text: "" };
}

// ── Deterministisk match (mock, fallback og test) ────────────────────────────

/** Dansk genitiv: "Mette Holm" → "Mette Holms", "Jonas" → "Jonas'". */
export const genitive = (name: string) => (/[sxz]$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}s`);

const topicTokens = (b: InventoryBelief) => tokens(`${b.statement} ${b.impact} ${b.cost}`);

function overlap(a: Set<string>, b: Set<string>): { shared: number; score: number } {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { shared, score: a.size && b.size ? shared / Math.min(a.size, b.size) : 0 };
}

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
const trimEnd = (s: string) => s.trim().replace(/[.!?]+$/, "");

/**
 * Tekstbaseret match uden LLM: lighed i udsagn (fælles), emne-overlap med en
 * begrænsende overbevisning (modvægt) og behov/værdier (passer til). Bruges af
 * mock-provideren og som fallback, hvis Claude ikke kan svare.
 */
export function heuristicMatches(inv: BeliefInventory): BeliefMatchResponse {
  const target = inv.persons.find((p) => p.id === inv.target);
  if (!target) return { matches: [], summary: "" };
  const matches: RawBeliefMatch[] = [];

  for (const other of inv.persons) {
    if (other.id === target.id) continue;
    for (const [from, to] of [
      [other, target],
      [target, other],
    ] as const) {
      const cands: RawBeliefMatch[] = [];
      for (const b of from.beliefs) {
        // 1) Fælles: modtageren har en beslægtet overbevisning af samme slags.
        const twin = to.beliefs
          .filter((x) => x.kind === b.kind)
          .map((x) => {
            const st = overlap(tokens(x.statement), tokens(b.statement));
            const tp = overlap(topicTokens(x), topicTokens(b));
            const s1 = st.shared >= 2 ? similarity(x.statement, b.statement) : 0;
            const s2 = x.type === b.type && tp.shared >= 3 ? 0.8 * tp.score : 0;
            return { x, s: Math.max(s1, s2) };
          })
          .sort((p, q) => q.s - p.s)[0];
        if (twin && twin.s >= 0.3) {
          cands.push({
            belief_id: b.id,
            to_person: to.id,
            kind: "shared",
            anchor_id: twin.x.id,
            fit: 55 + Math.round(45 * Math.min(1, twin.s / 0.6)),
            rationale:
              b.kind === "enabling"
                ? `${from.name} og ${to.name} opererer begge ud fra en beslægtet overbevisning: “${trimEnd(twin.x.statement)}”.`
                : `${from.name} og ${to.name} deler en beslægtet begrænsning: “${trimEnd(twin.x.statement)}”. Det, der løsner den hos den ene, kan hjælpe den anden.`,
            bridge_question: "",
          });
          continue;
        }
        if (b.kind !== "enabling") continue;

        // 2) Modvægt: emne-overlap med en af modtagerens begrænsende overbevisninger.
        const bt = topicTokens(b);
        const counter = to.beliefs
          .filter((x) => x.kind === "disenabling")
          .map((x) => ({ x, o: overlap(bt, topicTokens(x)) }))
          .filter(({ o }) => o.shared >= 2)
          .sort((p, q) => q.o.score - p.o.score)[0];
        if (counter) {
          cands.push({
            belief_id: b.id,
            to_person: to.id,
            kind: "counter",
            anchor_id: counter.x.id,
            fit: Math.min(95, 62 + Math.round(60 * counter.o.score) + 4 * counter.o.shared),
            rationale: `Kan være en modvægt til ${genitive(to.name)} begrænsende overbevisning “${trimEnd(counter.x.statement)}”${counter.x.cost ? `, som koster: ${lowerFirst(trimEnd(counter.x.cost))}` : ""}.`,
            bridge_question: `Hvad ville du gøre anderledes i morgen, hvis du tænkte: “${trimEnd(b.statement)}”?`,
          });
          continue;
        }

        // 3) Passer til: tjener modtagerens værdier (via ord eller behov) eller dominerende behov.
        const needs = needsInText(`${b.statement} ${b.impact}`);
        const need = needs.find((n) => to.dominant_needs.includes(n));
        const value = to.values
          .filter((v) => v.direction === "toward")
          .find((v) => overlap(tokens(v.value), bt).shared > 0 || needsInText(v.value).some((n) => needs.includes(n)));
        if (value || need) {
          const anchor = value ? value.id : `${to.id}.N.${need}`;
          const what = value ? `værdi “${value.value}”` : `behov for ${HUMAN_NEED_LABEL[need!].toLowerCase()}`;
          cands.push({
            belief_id: b.id,
            to_person: to.id,
            kind: "fit",
            anchor_id: anchor,
            fit: 50 + (value ? 12 : 0) + (need ? 10 : 0) + (b.type === "identity" ? 6 : 0),
            rationale: `Passer til ${genitive(to.name)} ${what}: ${lowerFirst(trimEnd(b.impact))}.`,
            bridge_question: `Hvor i dit liv er “${trimEnd(b.statement)}” allerede lidt sandt?`,
          });
        }
      }
      matches.push(...cands.sort((a, b) => b.fit - a.fit).slice(0, MAX_PER_DIRECTION));
    }
  }

  const resolved = resolveMatches(inv, matches);
  const incoming = resolved.filter((m) => m.to.personKey === (target.key ?? target.id) && m.kind !== "shared");
  const best = incoming[0];
  const summary = best
    ? `Stærkeste match for ${target.name}: “${best.belief.statement}” fra ${best.from.name} (${MATCH_KIND_LABEL[best.kind].toLowerCase()}, ${best.fit}/100). I alt ${resolved.length} match på tværs af ${inv.persons.length - 1} ${inv.persons.length === 2 ? "person" : "personer"}.`
    : resolved.length
      ? `${target.name} deler ${resolved.length} overbevisninger med andre i biblioteket.`
      : `Ingen tydelige match mellem ${target.name} og de øvrige personer endnu.`;
  return { matches, summary };
}

/** Kort, menneskelig label til et match, fx "Styrkende · Identitet". */
export function beliefLabel(m: Pick<BeliefMatch, "belief">): string {
  return `${m.belief.kind === "enabling" ? "Styrkende" : "Begrænsende"} · ${BELIEF_TYPE_LABEL[m.belief.type as keyof typeof BELIEF_TYPE_LABEL] ?? m.belief.type}`;
}

/**
 * Gruppér gemte match til visning for én person: hvad der passer til
 * personen, hvad personen kan give videre, og hvad de deler. Nyeste vinder
 * ved dubletter (samme udsagn fra samme afsender til samme modtager).
 */
export function matchesForPerson<T extends BeliefMatch & { createdAt?: Date | string }>(
  all: T[],
  personKey: string,
): { incoming: T[]; outgoing: T[]; shared: T[] } {
  const sorted = [...all].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
  const seen = new Set<string>();
  const tk = (t: string) => [...tokens(t)].sort().join(" ");
  const unique = sorted.filter((m) => {
    const pair = [m.from.personKey, m.to.personKey];
    // "Fælles" er symmetrisk: samme par og samme to udsagn, uanset hvem kørslen startede fra.
    const k =
      m.kind === "shared"
        ? `${[...pair].sort().join("|")}:${[tk(m.belief.statement), tk(m.anchor.text)].sort().join("~")}`
        : `${pair.join(">")}:${tk(m.belief.statement)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const byFit = (a: T, b: T) => b.fit - a.fit;
  return {
    incoming: unique.filter((m) => m.kind !== "shared" && m.to.personKey === personKey).sort(byFit),
    outgoing: unique.filter((m) => m.kind !== "shared" && m.from.personKey === personKey).sort(byFit),
    shared: unique.filter((m) => m.kind === "shared" && (m.to.personKey === personKey || m.from.personKey === personKey)).sort(byFit),
  };
}
