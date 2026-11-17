/**
 * Kerne-logik fra @bm/core, importeret modul for modul (uden Anthropic SDK
 * og Node-moduler), så artifactet bruger nøjagtig samme schema, prompt,
 * validering, rapport og indsigter som web-appen og CLI'en.
 */
import { z } from "zod";
import { AnalysisResultSchema, CATEGORIES, normalizeResult, type AnalysisResult } from "../../../packages/core/src/categories/registry";
import type { CategoryDefinition } from "../../../packages/core/src/categories/types";

export { AnalysisResultSchema, CATEGORIES, normalizeResult, type AnalysisResult, type CategoryDefinition };
export { SYSTEM_PROMPT } from "../../../packages/core/src/prompt/system-prompt";
export { buildUserMessage, type AnalysisContext } from "../../../packages/core/src/prompt/build-user-message";
export { coerceToSchema, extractJson } from "../../../packages/core/src/analyzer/coerce";
export { buildReport } from "../../../packages/core/src/report/build";
export { renderMarkdown } from "../../../packages/core/src/report/markdown";
export type { ReportBlock, ReportItem, ReportDocument, Tone } from "../../../packages/core/src/report/blocks";
export { aggregateDashboard, type AnalysisRecord, type DashboardData } from "../../../packages/core/src/insights/aggregate";
export { compareAnalyses, type ComparisonData } from "../../../packages/core/src/insights/compare";
export { suggestPatterns, type PatternSuggestion } from "../../../packages/core/src/insights/patterns";
export { countVakogPredicates, type LexiconCounts } from "../../../packages/core/src/insights/vakog-lexicon";
export { generateMockAnalysis } from "../../../packages/core/src/testing/mock-analysis";
export { SAMPLE_TRANSCRIPT } from "../../../packages/core/src/testing/sample-transcript";
export { DEMO_TRANSCRIPTS } from "../../../packages/core/src/testing/demo-transcripts";
export { normalizeTranscriptFile, isTextTranscriptFile, TEXT_EXTENSIONS } from "../../../packages/core/src/transcription/text-formats";
export { META_PROGRAMS, metaProgramPoleLabel, CONVINCER_CHANNEL_LABEL, CONVINCER_MODE_LABEL } from "../../../packages/core/src/categories/meta-programs";
export { STRATEGY_TYPE_LABEL } from "../../../packages/core/src/categories/cognitive-strategies";
export { HUMAN_NEED_LABEL, REP_SYSTEM_LABEL } from "../../../packages/core/src/schema/labels";
export { HUMAN_NEEDS, REP_SYSTEMS, type HumanNeedKey, type RepSystem } from "../../../packages/core/src/schema/common";

/** Fuldt JSON-schema (inkl. min/max) — sendes i prompten og bruges til lokal oprydning. */
export const ANALYSIS_JSON_SCHEMA = z.toJSONSchema(AnalysisResultSchema) as Record<string, unknown>;

export const getCategory = (key: string) => (CATEGORIES as readonly CategoryDefinition[]).find((c) => c.key === key);

export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

const TZ = "Europe/Copenhagen";
export function formatDate(d: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("da-DK", { timeZone: TZ, ...opts }).format(new Date(d));
}
export function relativeTime(d: string | number | Date): string {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("da-DK", { numeric: "auto" });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), "second");
  if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}
export const formatNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "x"
  );
}

/** Stabil farveslot 1-8 ud fra et navn — farven følger entiteten. */
export function colorSlot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
