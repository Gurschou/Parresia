import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AnalysisResult } from "@bm/core";
import { cn } from "@/lib/utils";

type Strategy = AnalysisResult["cognitive_strategies"]["strategies"][number];
type Step = Strategy["steps"][number];

const REP_SLOT: Record<string, number> = { V: 1, A: 2, K: 3, O: 4, G: 5, Ad: 6 };

/** Strategi-trin i NLP-notation: system + orientering (e/i) + tid (r/c). */
export function StepCode({ step }: { step: Pick<Step, "system" | "orientation" | "temporal"> }) {
  const o = step.orientation === "internal" ? "i" : "e";
  const t = step.temporal === "remembered" ? "r" : step.temporal === "constructed" ? "c" : "";
  return (
    <span className="whitespace-nowrap font-mono text-[13px] font-semibold leading-none">
      {step.system}
      <span className="relative top-[0.3em] ml-px text-[10px] font-medium opacity-75">{o}</span>
      {t && <span className="relative -top-[0.45em] text-[10px] font-medium opacity-75">{t}</span>}
    </span>
  );
}

/** Trinkæden: hvert trin er understreget med sit sansesystems farve. */
export function StepChain({ steps }: { steps: Pick<Step, "system" | "orientation" | "temporal" | "description">[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Strategiens trin">
      {steps.map((st, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span
            title={st.description}
            className="inline-flex h-8 items-center rounded-md border bg-background px-2.5"
            style={{ boxShadow: `inset 0 -3px 0 var(--series-${REP_SLOT[st.system] ?? 1})` }}
          >
            <StepCode step={st} />
          </span>
          <span className="text-muted-foreground" aria-hidden>
            →
          </span>
        </li>
      ))}
      <li className="inline-flex h-8 items-center rounded-md bg-foreground px-2.5 font-mono text-[12px] font-semibold text-background">Exit</li>
    </ol>
  );
}

export interface SpecimenData {
  quote: string;
  strategy: Pick<Strategy, "name" | "context"> & { steps: Pick<Step, "system" | "orientation" | "temporal" | "description">[] };
  expertName: string;
  dateLabel: string;
  href?: string;
  example?: boolean;
}

/** Finder det første fund, der viser vejen fra ordret citat til strategi. */
export function pickSpecimen(result: AnalysisResult | null | undefined): { quote: string; strategy: Strategy } | null {
  if (!result) return null;
  for (const st of result.cognitive_strategies.strategies) {
    const quote = st.quotes.find((q) => q.trim().length > 30) ?? st.steps.find((x) => x.quote.trim().length > 30)?.quote;
    if (quote && st.steps.length >= 2) return { quote, strategy: st };
  }
  return null;
}

function trimQuote(q: string, max = 190): string {
  const t = q.trim();
  return t.length <= max ? t : `${t.slice(0, t.lastIndexOf(" ", max))} …`;
}

/** Et rigtigt fund: ordret citat → udledt strategi. */
export function Specimen({ data, className }: { data: SpecimenData; className?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="eyebrow">{data.example ? "Eksempel · sagt i interviewet" : "Sagt i interviewet"}</span>
        <span className="truncate text-xs">
          {data.expertName} · {data.dateLabel}
        </span>
      </div>
      <p className="said mt-4 text-[19px] leading-[1.6] text-pretty sm:text-[21px]">
        <span className="marked">“{trimQuote(data.quote)}”</span>
      </p>
      <div className="my-6 flex items-center gap-3 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="eyebrow">Udledt strategi</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <StepChain steps={data.strategy.steps} />
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold leading-snug text-pretty">{data.strategy.name}</div>
          <div className="mt-1 text-sm text-muted-foreground text-pretty">{data.strategy.context}</div>
        </div>
        {data.href && <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition group-hover:text-primary" />}
      </div>
    </>
  );
  const cls = cn("group block min-w-0 rounded-2xl border bg-card p-6 shadow-[0_1px_0_oklch(0.2_0.03_240/0.04),0_6px_18px_-14px_oklch(0.2_0.03_240/0.25)] transition sm:p-7", data.href && "hover:-translate-y-0.5", className);
  return data.href ? (
    <Link href={data.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Indbygget eksempel, når brugeren endnu ikke har en færdig analyse. */
export const EXAMPLE_SPECIMEN: SpecimenData = {
  quote: "Jeg ser mødet for mig, før det sker. Hvis jeg ikke kan se det billede klart, så er jeg ikke klar.",
  strategy: {
    name: "Mental generalprøve før vigtige møder",
    context: "Forberedelse af store kundemøder aftenen før",
    steps: [
      { system: "V", orientation: "internal", temporal: "constructed", description: "Ser mødet for sig" },
      { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Spørger sig selv, hvad kunden har brug for" },
      { system: "V", orientation: "external", temporal: "unspecified", description: "Genlæser sine noter" },
      { system: "K", orientation: "internal", temporal: "unspecified", description: "Tester, om det føles rigtigt i maven" },
    ],
  },
  expertName: "Mette Holm",
  dateLabel: "eksempel",
  example: true,
};
