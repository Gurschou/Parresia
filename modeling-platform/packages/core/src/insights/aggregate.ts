import type { AnalysisResult } from "../categories/registry";
import { META_PROGRAMS, META_PROGRAM_IDS, type MetaProgramId } from "../categories/meta-programs";
import { HUMAN_NEEDS, REP_SYSTEMS, type HumanNeedKey, type RepSystem } from "../schema/common";
import { normalizeKey } from "./text-similarity";

/** Minimal form af en gemt analyse, som insights-funktionerne arbejder på. */
export interface AnalysisRecord {
  id: string;
  title: string;
  createdAt: Date | string;
  sessionDate?: string | null;
  expertId?: string | null;
  expertName?: string | null;
  result: AnalysisResult;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const dateOf = (a: AnalysisRecord) => (a.sessionDate ? new Date(a.sessionDate) : new Date(a.createdAt));

export interface DashboardData {
  totals: {
    analyses: number;
    experts: number;
    strategies: number;
    enablingBeliefs: number;
    disenablingBeliefs: number;
    values: number;
    questions: number;
  };
  vakogAverage: Record<RepSystem, number>;
  vakogByExpert: ({ expert: string; analyses: number } & Record<RepSystem, number>)[];
  primarySystems: Record<RepSystem, number>;
  metaPrograms: {
    program: MetaProgramId;
    name: string;
    poles: readonly [string, string];
    pole_a: number;
    pole_b: number;
    balanced: number;
    avgStrength: number;
    /** -100 (pole_a) … +100 (pole_b), vægtet med styrke. */
    tendency: number;
  }[];
  topValues: { value: string; count: number; experts: number; direction: "toward" | "away_from" }[];
  needsAverage: Record<HumanNeedKey, number>;
  needsByExpert: ({ expert: string } & Record<HumanNeedKey, number>)[];
  dominantNeeds: Record<HumanNeedKey, number>;
  beliefsOverTime: { id: string; date: string; label: string; expert: string; enabling: number; disenabling: number }[];
  strategyTypes: Record<string, number>;
}

export function aggregateDashboard(records: AnalysisRecord[]): DashboardData {
  const expertKey = (a: AnalysisRecord) => a.expertName || "Uden ekspert";
  const experts = new Set(records.map((r) => r.expertId ?? `anon:${expertKey(r)}`));

  const vakogAverage = Object.fromEntries(
    REP_SYSTEMS.map((s) => [s, round1(avg(records.map((r) => r.result.vakog.distribution[s])))]),
  ) as Record<RepSystem, number>;

  const byExpert = new Map<string, AnalysisRecord[]>();
  for (const r of records) byExpert.set(expertKey(r), [...(byExpert.get(expertKey(r)) ?? []), r]);

  const vakogByExpert = [...byExpert.entries()].map(([expert, rs]) => ({
    expert,
    analyses: rs.length,
    ...(Object.fromEntries(REP_SYSTEMS.map((s) => [s, round1(avg(rs.map((r) => r.result.vakog.distribution[s])))])) as Record<RepSystem, number>),
  }));

  const primarySystems = Object.fromEntries(REP_SYSTEMS.map((s) => [s, 0])) as Record<RepSystem, number>;
  for (const r of records) primarySystems[r.result.vakog.primary_system]++;

  const metaPrograms = META_PROGRAM_IDS.map((program) => {
    const hits = records.flatMap((r) => r.result.meta_programs.programs.filter((p) => p.program === program));
    const count = (l: string) => hits.filter((h) => h.leaning === l).length;
    const signed = hits.map((h) => (h.leaning === "pole_a" ? -h.strength : h.leaning === "pole_b" ? h.strength : 0));
    return {
      program,
      name: META_PROGRAMS[program].name,
      poles: META_PROGRAMS[program].poles,
      pole_a: count("pole_a"),
      pole_b: count("pole_b"),
      balanced: count("balanced"),
      avgStrength: round1(avg(hits.map((h) => h.strength))),
      tendency: round1(avg(signed)),
    };
  }).filter((m) => m.pole_a + m.pole_b + m.balanced > 0);

  const values = new Map<string, { value: string; count: number; experts: Set<string>; toward: number }>();
  for (const r of records) {
    for (const v of r.result.values_and_6_human_needs.values) {
      const k = normalizeKey(v.value);
      const cur = values.get(k) ?? { value: v.value, count: 0, experts: new Set<string>(), toward: 0 };
      cur.count++;
      cur.experts.add(expertKey(r));
      if (v.direction === "toward") cur.toward++;
      values.set(k, cur);
    }
  }
  const topValues = [...values.values()]
    .sort((a, b) => b.experts.size - a.experts.size || b.count - a.count)
    .slice(0, 12)
    .map((v) => ({ value: v.value, count: v.count, experts: v.experts.size, direction: (v.toward * 2 >= v.count ? "toward" : "away_from") as "toward" | "away_from" }));

  const needsAverage = Object.fromEntries(
    HUMAN_NEEDS.map((n) => [n, round1(avg(records.map((r) => r.result.values_and_6_human_needs.human_needs[n].score)))]),
  ) as Record<HumanNeedKey, number>;
  const needsByExpert = [...byExpert.entries()].map(([expert, rs]) => ({
    expert,
    ...(Object.fromEntries(
      HUMAN_NEEDS.map((n) => [n, round1(avg(rs.map((r) => r.result.values_and_6_human_needs.human_needs[n].score)))]),
    ) as Record<HumanNeedKey, number>),
  }));
  const dominantNeeds = Object.fromEntries(HUMAN_NEEDS.map((n) => [n, 0])) as Record<HumanNeedKey, number>;
  for (const r of records) for (const n of r.result.values_and_6_human_needs.dominant_needs) dominantNeeds[n]++;

  const beliefsOverTime = [...records]
    .sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime())
    .map((r) => ({
      id: r.id,
      date: dateOf(r).toISOString().slice(0, 10),
      label: r.title,
      expert: expertKey(r),
      enabling: r.result.enabling_beliefs.beliefs.length,
      disenabling: r.result.disenabling_beliefs.beliefs.length,
    }));

  const strategyTypes: Record<string, number> = {};
  for (const r of records) for (const s of r.result.cognitive_strategies.strategies) strategyTypes[s.strategy_type] = (strategyTypes[s.strategy_type] ?? 0) + 1;

  return {
    totals: {
      analyses: records.length,
      experts: experts.size,
      strategies: records.reduce((a, r) => a + r.result.cognitive_strategies.strategies.length, 0),
      enablingBeliefs: records.reduce((a, r) => a + r.result.enabling_beliefs.beliefs.length, 0),
      disenablingBeliefs: records.reduce((a, r) => a + r.result.disenabling_beliefs.beliefs.length, 0),
      values: records.reduce((a, r) => a + r.result.values_and_6_human_needs.values.length, 0),
      questions: records.reduce((a, r) => a + r.result.gaps_and_next_questions.next_questions.length, 0),
    },
    vakogAverage,
    vakogByExpert,
    primarySystems,
    metaPrograms,
    topValues,
    needsAverage,
    needsByExpert,
    dominantNeeds,
    beliefsOverTime,
    strategyTypes,
  };
}
