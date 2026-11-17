import { META_PROGRAMS, metaProgramPoleLabel, type MetaProgramId } from "../categories/meta-programs";
import { HUMAN_NEEDS, REP_SYSTEMS, type HumanNeedKey, type RepSystem } from "../schema/common";
import type { AnalysisRecord } from "./aggregate";
import { normalizeKey, similarity } from "./text-similarity";

export interface ComparisonColumn {
  id: string;
  title: string;
  expert: string;
  subject: string;
}

export interface ComparisonData {
  columns: ComparisonColumn[];
  vakog: { system: RepSystem; values: number[] }[];
  primarySystems: RepSystem[];
  needs: { need: HumanNeedKey; values: number[] }[];
  dominantNeeds: HumanNeedKey[][];
  metaPrograms: {
    program: MetaProgramId;
    name: string;
    cells: ({ label: string; leaning: "pole_a" | "pole_b" | "balanced"; strength: number } | null)[];
    /** true hvis alle analyser med programmet hælder samme vej. */
    agreement: boolean;
  }[];
  values: { value: string; key: string; present: boolean[]; shared: boolean }[];
  beliefs: { statement: string; kind: "enabling" | "disenabling"; column: number; sharedWith: number[] }[];
  strategies: { name: string; notation: string; type: string }[][];
  convincer: { channel: string; mode: string }[];
}

const SIMILAR = 0.34;

/** Side-om-side-sammenligning af 2-4 analyser. */
export function compareAnalyses(records: AnalysisRecord[]): ComparisonData {
  const columns = records.map((r) => ({
    id: r.id,
    title: r.title,
    expert: r.expertName || r.result.summary.subject,
    subject: r.result.summary.subject,
  }));

  const programs = [...new Set(records.flatMap((r) => r.result.meta_programs.programs.map((p) => p.program)))];
  const metaPrograms = programs.map((program) => {
    const cells = records.map((r) => {
      const p = r.result.meta_programs.programs.find((x) => x.program === program);
      return p ? { label: metaProgramPoleLabel(program, p.leaning), leaning: p.leaning, strength: p.strength } : null;
    });
    const leanings = new Set(cells.filter(Boolean).map((c) => c!.leaning));
    return { program, name: META_PROGRAMS[program].name, cells, agreement: cells.filter(Boolean).length > 1 && leanings.size === 1 };
  });

  const valueMap = new Map<string, { value: string; present: boolean[] }>();
  records.forEach((r, i) => {
    for (const v of r.result.values_and_6_human_needs.values) {
      const key = normalizeKey(v.value);
      const cur = valueMap.get(key) ?? { value: v.value, present: records.map(() => false) };
      cur.present[i] = true;
      valueMap.set(key, cur);
    }
  });
  const values = [...valueMap.entries()]
    .map(([key, v]) => ({ key, value: v.value, present: v.present, shared: v.present.filter(Boolean).length > 1 }))
    .sort((a, b) => Number(b.shared) - Number(a.shared) || a.value.localeCompare(b.value, "da"));

  const allBeliefs = records.flatMap((r, column) => [
    ...r.result.enabling_beliefs.beliefs.map((b) => ({ statement: b.statement, kind: "enabling" as const, column })),
    ...r.result.disenabling_beliefs.beliefs.map((b) => ({ statement: b.statement, kind: "disenabling" as const, column })),
  ]);
  const beliefs = allBeliefs.map((b) => ({
    ...b,
    sharedWith: [
      ...new Set(
        allBeliefs
          .filter((o) => o.column !== b.column && o.kind === b.kind && similarity(o.statement, b.statement) >= SIMILAR)
          .map((o) => o.column),
      ),
    ],
  }));

  return {
    columns,
    vakog: REP_SYSTEMS.map((system) => ({ system, values: records.map((r) => r.result.vakog.distribution[system]) })),
    primarySystems: records.map((r) => r.result.vakog.primary_system),
    needs: HUMAN_NEEDS.map((need) => ({ need, values: records.map((r) => r.result.values_and_6_human_needs.human_needs[need].score) })),
    dominantNeeds: records.map((r) => r.result.values_and_6_human_needs.dominant_needs),
    metaPrograms,
    values,
    beliefs,
    strategies: records.map((r) =>
      r.result.cognitive_strategies.strategies.map((s) => ({ name: s.name, notation: s.notation, type: s.strategy_type })),
    ),
    convincer: records.map((r) => ({ channel: r.result.meta_programs.convincer.channel, mode: r.result.meta_programs.convincer.mode })),
  };
}
