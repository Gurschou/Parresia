import { z } from "zod";
import {
  BeliefMatchResponseSchema,
  SYSTEM_PROMPT,
  buildBeliefMatchMessage,
  buildInventory,
  coerceToSchema,
  extractJson,
  heuristicMatches,
  matchesForPerson,
  resolveMatches,
  slug,
  type BeliefInventory,
  type BeliefMatch,
  type PersonRecord,
} from "./lib";
import type { SampleFn } from "./runtime";
import type { StoredAnalysis, StoredMatchRun } from "./store";

const MATCH_JSON_SCHEMA = z.toJSONSchema(BeliefMatchResponseSchema) as Record<string, unknown>;

/** Personnøglen i artifactet: navnet (som slug), samme som ekspertsiderne bruger. */
export const personKey = (name: string) => slug(name);

const toPersonRecord = (a: StoredAnalysis): PersonRecord => ({
  id: a.id,
  title: a.title,
  createdAt: a.sessionDate || a.createdAt,
  expertId: personKey(a.expertName),
  expertName: a.expertName,
  personKey: personKey(a.expertName),
  domain: a.domain,
  result: a.result,
});

/** Inventaret for én analyse: dens person (med hele historikken) mod alle andre. */
export function inventoryFor(analysis: StoredAnalysis, all: StoredAnalysis[]): BeliefInventory {
  const key = personKey(analysis.expertName);
  const records = [analysis, ...all.filter((a) => a.id !== analysis.id)].map(toPersonRecord);
  return buildInventory(
    { analysisId: analysis.id, records: records.filter((r) => r.personKey === key) },
    records.filter((r) => r.personKey !== key),
  );
}

function validate(text: string, inv: BeliefInventory) {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false as const, issues: "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt." };
  }
  const { value } = coerceToSchema(raw, MATCH_JSON_SCHEMA as Parameters<typeof coerceToSchema>[1]);
  const parsed = BeliefMatchResponseSchema.safeParse(value);
  if (parsed.success) return { ok: true as const, matches: resolveMatches(inv, parsed.data.matches), summary: parsed.data.summary.trim() };
  return {
    ok: false as const,
    issues: parsed.error.issues
      .slice(0, 12)
      .map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`)
      .join("\n"),
  };
}

function heuristicRun(analysisId: string, inv: BeliefInventory, note = ""): StoredMatchRun {
  const res = heuristicMatches(inv);
  return {
    analysisId,
    source: "heuristic",
    summary: res.summary,
    note,
    personCount: inv.persons.length - 1,
    matches: resolveMatches(inv, res.matches),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Overbevisnings-match for en analyse. Med Claude: platformens system-prompt
 * ORDRET som første blok (sample har ingen system-parameter), derefter samme
 * brugerbesked som web og CLI. Svaret valideres og id'erne slås op lokalt;
 * fejler Claude, bruges den tekstbaserede match.
 */
export async function runBeliefMatch(
  analysis: StoredAnalysis,
  all: StoredAnalysis[],
  opts: { sample: SampleFn | null; signal?: AbortSignal },
): Promise<StoredMatchRun> {
  const inv = inventoryFor(analysis, all);
  if (inv.persons.length < 2 || !opts.sample) return heuristicRun(analysis.id, inv);

  const build = (repairNote?: string) =>
    `<system_prompt>\n${SYSTEM_PROMPT}\n</system_prompt>\n\n${buildBeliefMatchMessage({ inventory: inv, mode: "prompt", jsonSchema: MATCH_JSON_SCHEMA, repairNote })}`;
  try {
    let repair: string | undefined;
    for (let round = 0; round < 2; round++) {
      const res = await opts.sample(build(repair), { modelTier: "default", signal: opts.signal, cache: false });
      const v = validate(res.text, inv);
      if (v.ok) {
        return {
          analysisId: analysis.id,
          source: "claude",
          summary: v.summary,
          note: "",
          personCount: inv.persons.length - 1,
          matches: v.matches,
          createdAt: new Date().toISOString(),
        };
      }
      repair = v.issues;
    }
    return heuristicRun(analysis.id, inv, "Claudes svar kunne ikke valideres, så matchet er tekstbaseret.");
  } catch (e) {
    if ((e as { code?: string })?.code === "cancelled") throw e;
    return heuristicRun(analysis.id, inv, "Claude kunne ikke svare, så matchet er tekstbaseret.");
  }
}

export type ViewMatch = BeliefMatch & { id: string; createdAt: string; source: StoredMatchRun["source"] };

/**
 * Alle match i biblioteket: gemte kørsler + en tekstbaseret kørsel (i
 * hukommelsen) for analyser, der aldrig er matchet — fx eksemplerne.
 * Match, der peger på slettede analyser, droppes.
 */
export function allMatches(analyses: StoredAnalysis[], runs: StoredMatchRun[]): { matches: ViewMatch[]; runFor: Map<string, StoredMatchRun> } {
  const ids = new Set(analyses.map((a) => a.id));
  const runFor = new Map<string, StoredMatchRun>();
  for (const r of runs) if (ids.has(r.analysisId)) runFor.set(r.analysisId, r);
  // Gemte kørsler vinder over de beregnede ved dubletter (ældste tidsstempel taber).
  for (const a of analyses) if (!runFor.has(a.id)) runFor.set(a.id, { ...heuristicRun(a.id, inventoryFor(a, analyses)), createdAt: new Date(0).toISOString() });
  // Navne slås op frisk (en analyse kan have skiftet person).
  const nameOf = new Map(analyses.map((a) => [a.id, a.expertName]));
  const matches: ViewMatch[] = [];
  for (const run of runFor.values()) {
    run.matches.forEach((m, i) => {
      const from = nameOf.get(m.from.analysisId);
      const to = nameOf.get(m.to.analysisId);
      if (!from || !to || personKey(from) === personKey(to)) return;
      matches.push({
        ...m,
        from: { ...m.from, name: from, personKey: personKey(from), expertId: personKey(from) },
        to: { ...m.to, name: to, personKey: personKey(to), expertId: personKey(to) },
        id: `${run.analysisId}:${i}`,
        createdAt: run.createdAt,
        source: run.source,
      });
    });
  }
  return { matches, runFor };
}

export { matchesForPerson };
