import type { z } from "zod";
import type { ReportBlock } from "../report/blocks";

/** Numeriske nøgletal en kategori bidrager med til dashboard og sammenligning. */
export type CategoryMetrics = Record<string, number>;

/**
 * En analysekategori. At tilføje en ny kategori kræver kun:
 *   1. en ny fil i `categories/` der eksporterer `defineCategory({...})`
 *   2. én linje i `categories/registry.ts`
 * Schema, prompt-instruktioner, rapport (MD/PDF/web) og metrics følger med.
 */
export interface CategoryDefinition<K extends string = string, S extends z.ZodType = z.ZodType> {
  /** JSON-nøgle i analyse-resultatet (snake_case, engelsk). */
  key: K;
  /** Dansk titel til UI/rapport. */
  title: string;
  /** Kort dansk forklaring til UI/rapport. */
  description: string;
  /** Ikon-navn (lucide) til web-UI. */
  icon: string;
  /** Præcise instruktioner til modellen om hvad der skal udtrækkes (dansk). */
  instructions: string;
  /** Zod-schema for kategoriens data. Kun required-felter, ingen nullable. */
  schema: S;
  /** Deterministisk efterbehandling efter validering (fx normalisering af procenter). */
  normalize?: (data: z.infer<S>) => z.infer<S>;
  /** Rapportblokke (deles af Markdown, PDF og web). */
  toReport: (data: z.infer<S>) => ReportBlock[];
  /** Nøgletal til dashboard (fx antal fund). */
  metrics?: (data: z.infer<S>) => CategoryMetrics;
  /** Antal fund — bruges til "tom kategori"-markering og dashboard. */
  count: (data: z.infer<S>) => number;
}

export function defineCategory<K extends string, S extends z.ZodType>(
  def: CategoryDefinition<K, S>,
): CategoryDefinition<K, S> {
  return def;
}
