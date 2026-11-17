import { aggregateDashboard, type AnalysisRecord } from "@bm/core";
import { getCompletedAnalyses, type AnalysisFilters } from "./analyses";

export async function getAnalysisRecords(userId: string, f: AnalysisFilters = {}): Promise<AnalysisRecord[]> {
  const rows = await getCompletedAnalyses(userId, f);
  return rows.filter((r) => r.result).map((r) => ({ ...r, result: r.result! }));
}

/** Aggregerede mønstre på tværs af analyser (dashboard / ekspertprofil). */
export async function getDashboard(userId: string, f: AnalysisFilters = {}) {
  return aggregateDashboard(await getAnalysisRecords(userId, f));
}
