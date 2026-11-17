import { z } from "zod";
import { summaryCategory } from "./summary";
import { cognitiveStrategiesCategory } from "./cognitive-strategies";
import { disenablingBeliefsCategory, enablingBeliefsCategory } from "./beliefs";
import { valuesNeedsCategory } from "./values-needs";
import { metaProgramsCategory } from "./meta-programs";
import { meaningMakersCategory } from "./meaning-makers";
import { vakogCategory } from "./vakog";
import { eyeAccessingCuesCategory } from "./eye-accessing-cues";
import { createGapsCategory } from "./gaps";
import type { CategoryDefinition } from "./types";

/**
 * KATEGORI-REGISTRET — den eneste liste der skal ændres for at tilføje en
 * ny analysekategori. Rækkefølgen her er rækkefølgen i prompt, JSON,
 * rapport og UI.
 */
const ANALYSIS_CATEGORIES = [
  summaryCategory,
  cognitiveStrategiesCategory,
  enablingBeliefsCategory,
  disenablingBeliefsCategory,
  valuesNeedsCategory,
  metaProgramsCategory,
  meaningMakersCategory,
  vakogCategory,
  eyeAccessingCuesCategory,
] as const;

/** "Mangler & næste spørgsmål" kan pege på alle andre kategorier (undtagen sammenfatningen). */
export const gapsCategory = createGapsCategory(
  ANALYSIS_CATEGORIES.filter((c) => c.key !== "summary").map((c) => ({ key: c.key, title: c.title })),
);

export const CATEGORIES = [...ANALYSIS_CATEGORIES, gapsCategory] as const;

type AnyCategory = (typeof CATEGORIES)[number];
export type CategoryKey = AnyCategory["key"];

type ResultShape = { [C in AnyCategory as C["key"]]: C["schema"] };

/** Det samlede, validerede analyse-schema — bygget fra registret. */
export const AnalysisResultSchema = z.object(
  Object.fromEntries(CATEGORIES.map((c) => [c.key, c.schema])) as unknown as ResultShape,
);
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/** Bump ved brudte ændringer i schemaet (gemmes på hver analyse). */
export const ANALYSIS_SCHEMA_VERSION = 1;

/** De sektioner specifikationen kræver (alt andet er tillæg). */
export const REQUIRED_SECTION_KEYS = [
  "cognitive_strategies",
  "enabling_beliefs",
  "disenabling_beliefs",
  "values_and_6_human_needs",
  "meta_programs",
  "meaning_makers",
  "vakog",
  "eye_accessing_cues",
  "gaps_and_next_questions",
] as const satisfies readonly CategoryKey[];

export function getCategory(key: string): CategoryDefinition | undefined {
  return (CATEGORIES as readonly CategoryDefinition[]).find((c) => c.key === key);
}

/** Kører hver kategoris deterministiske normalisering. */
export function normalizeResult(result: AnalysisResult): AnalysisResult {
  const out: Record<string, unknown> = { ...result };
  for (const c of CATEGORIES as readonly CategoryDefinition[]) {
    if (c.normalize && out[c.key] !== undefined) out[c.key] = c.normalize(out[c.key]);
  }
  return out as AnalysisResult;
}

/** Nøgletal pr. kategori, fladt som `kategori.metric`. */
export function resultMetrics(result: AnalysisResult): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of CATEGORIES as readonly CategoryDefinition[]) {
    const data = (result as Record<string, unknown>)[c.key];
    if (data === undefined) continue;
    m[`${c.key}.count`] = c.count(data);
    for (const [k, v] of Object.entries(c.metrics?.(data) ?? {})) m[`${c.key}.${k}`] = v;
  }
  return m;
}
