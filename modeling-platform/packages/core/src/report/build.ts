import { CATEGORIES, type AnalysisResult } from "../categories/registry";
import type { CategoryDefinition } from "../categories/types";
import type { ReportDocument } from "./blocks";

export interface ReportInfo {
  title?: string;
  expertName?: string;
  projectName?: string;
  sessionDate?: string;
  model?: string;
  provider?: string;
  sourceLabel?: string;
  generatedAt?: Date;
}

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Copenhagen" }).format(d);

/** Oversætter et analyse-resultat til den format-uafhængige rapportmodel. */
export function buildReport(result: AnalysisResult, info: ReportInfo = {}): ReportDocument {
  const generatedAt = info.generatedAt ?? new Date();
  const meta = [
    { label: "Model/ekspert", value: info.expertName || result.summary.subject },
    ...(info.projectName ? [{ label: "Projekt", value: info.projectName }] : []),
    ...(info.sessionDate ? [{ label: "Sessionsdato", value: info.sessionDate }] : []),
    ...(info.sourceLabel ? [{ label: "Kilde", value: info.sourceLabel }] : []),
    ...(info.model ? [{ label: "Analysemodel", value: info.provider === "mock" ? `${info.model} (mock)` : info.model }] : []),
    { label: "Genereret", value: fmtDate(generatedAt) },
  ];
  return {
    title: info.title || `Adfærdsmodel: ${result.summary.subject}`,
    subtitle: result.summary.result_modeled,
    generatedAt: generatedAt.toISOString(),
    meta,
    sections: (CATEGORIES as readonly CategoryDefinition[]).map((c) => ({
      key: c.key,
      title: c.title,
      description: c.description,
      blocks: c.toReport((result as Record<string, unknown>)[c.key]),
    })),
  };
}
