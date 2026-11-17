import { META_PROGRAMS, metaProgramPoleLabel } from "../categories/meta-programs";
import { CONVINCER_CHANNEL_LABEL, CONVINCER_MODE_LABEL } from "../categories/meta-programs";
import { STRATEGY_TYPE_LABEL } from "../categories/cognitive-strategies";
import { HUMAN_NEED_LABEL, REP_SYSTEM_LABEL } from "../schema/labels";
import type { AnalysisRecord } from "./aggregate";
import { normalizeKey, similarity } from "./text-similarity";

export interface PatternOccurrence {
  analysisId: string;
  analysisTitle: string;
  expert: string;
  label: string;
  quote?: string;
}

export interface PatternSuggestion {
  /** Stabil nøgle (til "allerede gemt"-markering). */
  key: string;
  category: string;
  title: string;
  description: string;
  /** Antal forskellige eksperter mønstret optræder hos. */
  expertCount: number;
  occurrences: PatternOccurrence[];
}

const expertOf = (r: AnalysisRecord) => r.expertId ?? `anon:${r.expertName || r.result.summary.subject}`;
const nameOf = (r: AnalysisRecord) => r.expertName || r.result.summary.subject;

function group(
  records: AnalysisRecord[],
  extract: (r: AnalysisRecord) => { key: string; label: string; quote?: string }[],
): Map<string, { records: AnalysisRecord[]; items: PatternOccurrence[] }> {
  const m = new Map<string, { records: AnalysisRecord[]; items: PatternOccurrence[] }>();
  for (const r of records) {
    const seen = new Set<string>();
    for (const x of extract(r)) {
      if (seen.has(x.key)) continue;
      seen.add(x.key);
      const cur = m.get(x.key) ?? { records: [], items: [] };
      cur.records.push(r);
      cur.items.push({ analysisId: r.id, analysisTitle: r.title, expert: nameOf(r), label: x.label, quote: x.quote });
      m.set(x.key, cur);
    }
  }
  return m;
}

/**
 * Finder kandidater til fælles mønstre på tværs af eksperter — deterministisk
 * (ingen LLM-kald): samme meta-program-pol, samme strategi-sekvens, samme
 * værdi, beslægtede overbevisninger, samme dominerende behov m.m.
 * Et mønster foreslås, når det optræder hos mindst `minExperts` eksperter.
 */
export function suggestPatterns(records: AnalysisRecord[], opts: { minExperts?: number } = {}): PatternSuggestion[] {
  const minExperts = opts.minExperts ?? 2;
  const out: PatternSuggestion[] = [];
  const push = (category: string, key: string, title: string, description: string, g: { records: AnalysisRecord[]; items: PatternOccurrence[] }) => {
    const expertCount = new Set(g.records.map(expertOf)).size;
    if (expertCount >= minExperts) out.push({ key: `${category}:${key}`, category, title, description, expertCount, occurrences: g.items });
  };

  // Meta-programmer (samme pol)
  for (const [key, g] of group(records, (r) =>
    r.result.meta_programs.programs
      .filter((p) => p.leaning !== "balanced" && p.strength >= 50)
      .map((p) => ({
        key: `${p.program}:${p.leaning}`,
        label: `${META_PROGRAMS[p.program].name}: ${metaProgramPoleLabel(p.program, p.leaning)} (${Math.round(p.strength)})`,
        quote: p.quotes[0],
      })),
  )) {
    const [program, leaning] = key.split(":") as [keyof typeof META_PROGRAMS, "pole_a" | "pole_b"];
    push(
      "meta_programs",
      key,
      `${META_PROGRAMS[program].name}: ${metaProgramPoleLabel(program, leaning)}`,
      "Samme meta-program-pol optræder hos flere eksperter.",
      g,
    );
  }

  // Strategi-sekvenser (samme rækkefølge af repræsentationssystemer)
  for (const [key, g] of group(records, (r) =>
    r.result.cognitive_strategies.strategies
      .filter((s) => s.steps.length >= 2)
      .map((s) => ({ key: `${s.strategy_type}:${s.steps.map((x) => x.system).join("-")}`, label: `${s.name} — ${s.notation}`, quote: s.quotes[0] })),
  )) {
    const [type, seq] = key.split(":") as [keyof typeof STRATEGY_TYPE_LABEL, string];
    push(
      "cognitive_strategies",
      key,
      `${STRATEGY_TYPE_LABEL[type] ?? type}-strategi: ${seq.split("-").join(" → ")}`,
      `Samme sekvens (${seq
        .split("-")
        .map((s) => REP_SYSTEM_LABEL[s as keyof typeof REP_SYSTEM_LABEL] ?? s)
        .join(" → ")}) bruges af flere eksperter.`,
      g,
    );
  }

  // Værdier
  for (const [key, g] of group(records, (r) =>
    r.result.values_and_6_human_needs.values.map((v) => ({ key: normalizeKey(v.value), label: v.value, quote: v.quotes[0] })),
  )) {
    push("values_and_6_human_needs", `value:${key}`, `Værdi: ${g.items[0]!.label}`, "Den samme værdi går igen hos flere eksperter.", g);
  }

  // Dominerende behov
  for (const [key, g] of group(records, (r) =>
    r.result.values_and_6_human_needs.dominant_needs.map((n) => ({ key: n, label: HUMAN_NEED_LABEL[n] })),
  )) {
    push("values_and_6_human_needs", `need:${key}`, `Dominerende behov: ${g.items[0]!.label}`, "Det samme behov ser ud til at drive flere eksperter.", g);
  }

  // Primært repræsentationssystem
  for (const [key, g] of group(records, (r) => [{ key: r.result.vakog.primary_system, label: REP_SYSTEM_LABEL[r.result.vakog.primary_system] }])) {
    push("vakog", key, `Primært system: ${g.items[0]!.label}`, "Flere eksperter foretrækker det samme repræsentationssystem.", g);
  }

  // Convincer
  for (const [key, g] of group(records, (r) => {
    const c = r.result.meta_programs.convincer;
    return c.channel === "unknown" && c.mode === "unknown"
      ? []
      : [{ key: `${c.channel}:${c.mode}`, label: `${CONVINCER_CHANNEL_LABEL[c.channel]} · ${CONVINCER_MODE_LABEL[c.mode]}`, quote: c.quotes[0] }];
  })) {
    push("meta_programs", `convincer:${key}`, `Convincer: ${g.items[0]!.label}`, "Flere eksperter bliver overbevist på samme måde.", g);
  }

  // Overbevisninger — grådig klyngedannelse på tekstlighed
  for (const kind of ["enabling_beliefs", "disenabling_beliefs"] as const) {
    const all = records.flatMap((r) => r.result[kind].beliefs.map((b) => ({ r, b })));
    const used = new Set<number>();
    all.forEach((seed, i) => {
      if (used.has(i)) return;
      const cluster = [i];
      all.forEach((o, j) => {
        if (j !== i && !used.has(j) && expertOf(o.r) !== expertOf(seed.r) && similarity(seed.b.statement, o.b.statement) >= 0.34) cluster.push(j);
      });
      if (cluster.length < 2) return;
      cluster.forEach((c) => used.add(c));
      const g = {
        records: cluster.map((c) => all[c]!.r),
        items: cluster.map((c) => ({
          analysisId: all[c]!.r.id,
          analysisTitle: all[c]!.r.title,
          expert: nameOf(all[c]!.r),
          label: all[c]!.b.statement,
          quote: all[c]!.b.quotes[0],
        })),
      };
      push(
        kind,
        `belief:${normalizeKey(seed.b.statement)}`,
        `${kind === "enabling_beliefs" ? "Styrkende" : "Begrænsende"} overbevisning: “${seed.b.statement}”`,
        "Beslægtede overbevisninger hos flere eksperter.",
        g,
      );
    });
  }

  return out.sort((a, b) => b.expertCount - a.expertCount || b.occurrences.length - a.occurrences.length);
}
