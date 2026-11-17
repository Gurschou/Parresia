import type { Metadata } from "next";
import Link from "next/link";
import { Check, Columns3, Link2 } from "lucide-react";
import {
  CONVINCER_CHANNEL_LABEL,
  CONVINCER_MODE_LABEL,
  HUMAN_NEED_LABEL,
  REP_SYSTEM_LABEL,
  STRATEGY_TYPE_LABEL,
  compareAnalyses,
} from "@bm/core";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { ComparePicker } from "@/components/compare/compare-picker";
import { DistributionBar, NeedsRadar } from "@/components/report/overview-charts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAnalysisRecords } from "@/server/dashboard";
import { requireUser } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sammenlign" };

const COL = (i: number) => `var(--series-${i + 1})`;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser();
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 4);
  const all = await getAnalysisRecords(user.id);
  const options = all.map((r) => ({ id: r.id, title: r.title, expertName: r.expertName ?? null, date: (r.sessionDate ?? new Date(r.createdAt).toISOString()).slice(0, 10) }));
  const records = ids.map((id) => all.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);

  if (all.length < 2) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Sammenlign" title="Sammenlign modeller" />
        <EmptyState icon={Columns3} title="Du skal bruge mindst to færdige analyser" description="Analysér flere interviews — med samme ekspert over tid eller med forskellige eksperter — og sammenlign dem her." />
      </PageContainer>
    );
  }

  if (records.length < 2) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Sammenlign" title="Sammenlign modeller" description="Læg 2-4 analyser side om side: VAKOG, behov, meta-programmer, værdier, overbevisninger og strategier." />
        <Card className="p-6">
          <ComparePicker options={options} initial={records.map((r) => r.id)} />
        </Card>
      </PageContainer>
    );
  }

  const c = compareAnalyses(records);
  const sharedValues = c.values.filter((v) => v.shared);
  const agreeing = c.metaPrograms.filter((m) => m.agreement);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sammenlign"
        title="Side om side"
        description={`${c.columns.length} analyser · ${sharedValues.length} fælles værdier · ${agreeing.length} meta-programmer med samme retning`}
      />

      {/* Kolonne-legend (farve følger analysen) */}
      <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${c.columns.length}, minmax(0,1fr))` }}>
        {c.columns.map((col, i) => (
          <Link key={col.id} href={`/analyses/${col.id}`} className="group rounded-2xl border bg-card p-4 transition hover:border-primary/30">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: COL(i) }} />
              <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.expert}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 font-serif text-lg font-semibold leading-snug group-hover:text-primary">{col.title}</div>
          </Link>
        ))}
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="VAKOG" description="Fordelingen af repræsentationssystemer pr. analyse.">
            <div className="space-y-4">
              {c.columns.map((col, i) => {
                const dist = Object.fromEntries(c.vakog.map((v) => [v.system, v.values[i]!]));
                return (
                  <div key={col.id}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="size-2.5 rounded-full" style={{ background: COL(i) }} /> {col.expert}
                      </span>
                      <span className="text-muted-foreground">Primært: {REP_SYSTEM_LABEL[c.primarySystems[i]!]}</span>
                    </div>
                    <DistributionBar distribution={dist} highlight={c.primarySystems[i]} />
                  </div>
                );
              })}
            </div>
          </Section>
          <Section title="6 Human Needs" description="Overlejrede behovsprofiler.">
            <NeedsRadar
              height={280}
              data={c.needs.map((n) => ({ need: HUMAN_NEED_LABEL[n.need], ...Object.fromEntries(n.values.map((v, i) => [`s${i}`, v])) }))}
              series={c.columns.map((col, i) => ({ key: `s${i}`, name: col.expert, color: COL(i) }))}
            />
            <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
              {c.columns.map((col, i) => (
                <span key={col.id} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ background: COL(i) }} /> {col.expert}:{" "}
                  <span className="text-muted-foreground">{c.dominantNeeds[i]!.map((n) => HUMAN_NEED_LABEL[n]).join(" & ")}</span>
                </span>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Meta-programmer" description="Samme retning på tværs af analyserne er markeret som fælles mønster.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Program</th>
                  {c.columns.map((col, i) => (
                    <th key={col.id} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: COL(i) }} /> {col.expert}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.metaPrograms.map((m) => (
                  <tr key={m.program} className={cn("border-b last:border-0", m.agreement && "bg-positive-soft/40")}>
                    <td className="py-2.5 pr-4 font-medium">
                      <span className="flex items-center gap-2">
                        {m.name}
                        {m.agreement && (
                          <Badge tone="positive">
                            <Link2 /> Fælles
                          </Badge>
                        )}
                      </span>
                    </td>
                    {m.cells.map((cell, i) => (
                      <td key={i} className="px-3 py-2.5">
                        {cell ? (
                          <span>
                            {cell.label}
                            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{Math.round(cell.strength)}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 pr-4 font-medium">Convincer</td>
                  {c.convincer.map((cv, i) => (
                    <td key={i} className="px-3 py-2.5">
                      {CONVINCER_CHANNEL_LABEL[cv.channel as keyof typeof CONVINCER_CHANNEL_LABEL]} · {CONVINCER_MODE_LABEL[cv.mode as keyof typeof CONVINCER_MODE_LABEL]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Værdier" description="Værdier der går igen, står øverst.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {c.values.slice(0, 20).map((v) => (
                    <tr key={v.key} className={cn("border-b last:border-0", v.shared && "font-semibold")}>
                      <td className="py-2 pr-3">{v.value}</td>
                      {v.present.map((p, i) => (
                        <td key={i} className="w-12 py-2 text-center">
                          {p ? <Check className="mx-auto size-4" style={{ color: COL(i) }} /> : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Strategier" description="Notation for hver analyses strategier.">
            <div className="space-y-4">
              {c.strategies.map((list, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: COL(i) }} /> {c.columns[i]!.expert}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((s, j) => (
                      <li key={j} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {s.name} <span className="text-xs text-muted-foreground">· {STRATEGY_TYPE_LABEL[s.type as keyof typeof STRATEGY_TYPE_LABEL] ?? s.type}</span>
                        </span>
                        <code className="shrink-0 font-mono text-xs">{s.notation}</code>
                      </li>
                    ))}
                    {list.length === 0 && <li className="text-sm text-muted-foreground">Ingen strategier.</li>}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Overbevisninger" description="Beslægtede overbevisninger på tværs af analyserne er markeret.">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${c.columns.length}, minmax(0,1fr))` }}>
            {c.columns.map((col, i) => (
              <div key={col.id} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: COL(i) }} /> {col.expert}
                </div>
                {c.beliefs
                  .filter((b) => b.column === i)
                  .map((b, j) => (
                    <div key={j} className={cn("rounded-lg border p-2.5 text-sm", b.kind === "enabling" ? "border-positive/25" : "border-negative/25")}>
                      <div className="text-pretty">{b.statement}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone={b.kind === "enabling" ? "positive" : "negative"}>{b.kind === "enabling" ? "Styrkende" : "Begrænsende"}</Badge>
                        {b.sharedWith.length > 0 && (
                          <Badge tone="info">
                            <Link2 /> deles med {b.sharedWith.map((k) => c.columns[k]!.expert).join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Section>

        <details className="rounded-2xl border bg-card p-6">
          <summary className="cursor-pointer font-semibold">Skift udvalg</summary>
          <div className="mt-4">
            <ComparePicker options={options} initial={records.map((r) => r.id)} />
          </div>
        </details>
      </div>
    </PageContainer>
  );
}
