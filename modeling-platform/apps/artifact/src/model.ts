import { z } from "zod";
import {
  ModelingMapSchema,
  SYSTEM_PROMPT,
  buildModelingMessage,
  buildModelingSource,
  coerceToSchema,
  extractJson,
  heuristicModelingMap,
  verifyModelingMap,
  type HumanNeedKey,
  type ModelingMap,
  type ModelingSource,
  type SessionInput,
} from "./lib";
import { personKey } from "./match";
import type { SampleFn } from "./runtime";
import type { StoredAnalysis, StoredModelRun } from "./store";

const MODEL_JSON_SCHEMA = z.toJSONSchema(ModelingMapSchema) as Record<string, unknown>;
/** sample tager ikke ubegrænset input: hold kildegrundlaget lidt under analysens grænse. */
const LIMITS = { maxChars: 200_000, maxFirstChars: 180_000, maxSessions: 10 };

const toSession = (a: StoredAnalysis): SessionInput => ({
  analysisId: a.id,
  title: a.title,
  date: a.sessionDate || a.createdAt,
  transcript: a.transcript,
  result: a.result,
});

/** Kildegrundlaget: analysens person med alle sine samtaler (+ din egen profil som installatør). */
export function modelingSourceFor(analysis: StoredAnalysis, all: StoredAnalysis[], selfName: string): ModelingSource {
  const key = personKey(analysis.expertName);
  const selfKey = selfName ? personKey(selfName) : "";
  const same = all.filter((a) => a.id !== analysis.id && personKey(a.expertName) === key);
  const mine = selfKey && selfKey !== key ? all.filter((a) => personKey(a.expertName) === selfKey) : [];
  return buildModelingSource({
    person: { name: analysis.expertName, domain: analysis.domain, goal: analysis.goal, isSelf: !!selfKey && selfKey === key },
    target: toSession(analysis),
    others: same.map(toSession),
    installer: mine.length
      ? {
          name: selfName,
          disenabling: [...new Set(mine.flatMap((a) => a.result.disenabling_beliefs.beliefs.map((b) => b.statement)))].slice(0, 6),
          dominant_needs: mine[0]!.result.values_and_6_human_needs.dominant_needs as HumanNeedKey[],
        }
      : null,
    limits: LIMITS,
  });
}

function validate(text: string): { ok: true; value: ModelingMap } | { ok: false; issues: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return { ok: false, issues: "- Svaret var ikke gyldig JSON. Returnér kun ét JSON-objekt." };
  }
  const { value } = coerceToSchema(raw, MODEL_JSON_SCHEMA as Parameters<typeof coerceToSchema>[1]);
  const parsed = ModelingMapSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues
      .slice(0, 12)
      .map((i) => `- ${i.path.join(".") || "$"}: ${i.message}`)
      .join("\n"),
  };
}

const heuristicRun = (analysis: StoredAnalysis, src: ModelingSource, note = ""): StoredModelRun => ({
  analysisId: analysis.id,
  personKey: personKey(analysis.expertName),
  source: "heuristic",
  note,
  result: verifyModelingMap(heuristicModelingMap(src), src),
  createdAt: new Date().toISOString(),
});

/**
 * Gustavs modellering af analysens person ud fra alle personens samtaler. Med
 * Claude: platformens system-prompt ORDRET som første blok (sample har ingen
 * system-parameter), derefter samme brugerbesked som web og CLI. Svaret
 * efterprøves mod transskripterne; fejler Claude, bygges det tekstbaserede kort.
 */
export async function runModeling(
  analysis: StoredAnalysis,
  all: StoredAnalysis[],
  selfName: string,
  opts: { sample: SampleFn | null; signal?: AbortSignal },
): Promise<StoredModelRun> {
  const src = modelingSourceFor(analysis, all, selfName);
  if (!opts.sample) return heuristicRun(analysis, src);
  const build = (repairNote?: string) =>
    `<system_prompt>\n${SYSTEM_PROMPT}\n</system_prompt>\n\n${buildModelingMessage({ source: src, mode: "prompt", jsonSchema: MODEL_JSON_SCHEMA, repairNote })}`;
  try {
    let repair: string | undefined;
    for (let round = 0; round < 2; round++) {
      const res = await opts.sample(build(repair), { modelTier: "complex", signal: opts.signal, cache: false });
      const v = validate(res.text);
      if (v.ok) {
        return {
          analysisId: analysis.id,
          personKey: personKey(analysis.expertName),
          source: "claude",
          note: "",
          result: verifyModelingMap(v.value, src),
          createdAt: new Date().toISOString(),
        };
      }
      repair = v.issues;
    }
    return heuristicRun(analysis, src, "Claudes svar kunne ikke valideres, så kortet er tekstbaseret.");
  } catch (e) {
    if ((e as { code?: string })?.code === "cancelled") throw e;
    return heuristicRun(analysis, src, "Claude kunne ikke svare, så kortet er tekstbaseret.");
  }
}

/**
 * Personens aktuelle kort: den nyeste gemte kørsel, ellers et tekstbaseret kort
 * beregnet i hukommelsen (fx for eksemplerne). Navne slås op frisk.
 */
export function currentModel(key: string, analyses: StoredAnalysis[], runs: StoredModelRun[], selfName: string): { run: StoredModelRun; stored: boolean; history: StoredModelRun[] } | null {
  const mine = analyses.filter((a) => personKey(a.expertName) === key);
  if (!mine.length) return null;
  const ids = new Set(mine.map((a) => a.id));
  const history = runs.filter((r) => ids.has(r.analysisId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (history[0]) return { run: history[0], stored: true, history };
  const newest = mine[0]!;
  return { run: { ...heuristicRun(newest, modelingSourceFor(newest, analyses, selfName)), createdAt: new Date(0).toISOString() }, stored: false, history: [] };
}
