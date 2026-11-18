import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronRight, Cpu, FolderKanban, Gauge, Mic, ShieldAlert, ShieldCheck, User, Workflow } from "lucide-react";
import {
  CATEGORIES,
  HUMAN_NEEDS,
  HUMAN_NEED_LABEL,
  META_PROGRAMS,
  REP_SYSTEM_LABEL,
  buildReport,
  type AnalysisMeta,
  type AnalysisResult,
  type CategoryDefinition,
} from "@bm/core";
import type { AnalysisDetail } from "@/server/analyses";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";
import { AnalysisActions } from "@/components/analysis/analysis-actions";
import { CategoryIcon } from "./category-icon";
import { DistributionBar, MetaProgramScale, NeedsRadar, VakogLegend } from "./overview-charts";
import { ReportBlocks } from "./report-blocks";
import { ReportToc } from "./report-toc";

function StatTile({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 bg-card px-5 py-4">
      <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="size-4 shrink-0" /> <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-[-0.03em]">{value}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

export function ReportView({ analysis }: { analysis: AnalysisDetail & { result: AnalysisResult } }) {
  const r = analysis.result;
  const meta = analysis.meta as AnalysisMeta | null;
  const doc = buildReport(r, {
    expertName: analysis.expert?.name,
    projectName: analysis.project?.name,
    sessionDate: analysis.sessionDate ?? undefined,
    model: analysis.model ?? undefined,
    provider: meta?.provider,
  });
  const categories = CATEGORIES as readonly CategoryDefinition[];
  const counts = Object.fromEntries(categories.map((c) => [c.key, c.count((r as Record<string, unknown>)[c.key])]));
  const programs = [...r.meta_programs.programs].sort((a, b) => b.strength - a.strength).slice(0, 6);
  const needsData = HUMAN_NEEDS.map((n) => ({ need: HUMAN_NEED_LABEL[n], s0: r.values_and_6_human_needs.human_needs[n].score }));

  return (
    <div>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto max-w-7xl px-4 pb-9 pt-7 sm:px-8 lg:pt-9">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/analyses" className="hover:text-foreground">
              Analyser
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="truncate text-foreground">{analysis.title}</span>
          </nav>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow mb-3 text-primary">Adfærdsmodel</div>
              <h1 className="text-[2.6rem] leading-none text-balance sm:text-6xl">{r.summary.subject}</h1>
              <p className="mt-4 text-xl leading-snug text-muted-foreground text-pretty">{r.summary.result_modeled}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {analysis.expert && (
                  <Badge tone="outline" className="bg-card">
                    <User /> <Link href={`/experts/${analysis.expert.id}`}>{analysis.expert.name}</Link>
                  </Badge>
                )}
                {analysis.project && (
                  <Badge tone="outline" className="bg-card">
                    <FolderKanban /> {analysis.project.name}
                  </Badge>
                )}
                <Badge tone="outline" className="bg-card">
                  <CalendarDays /> {formatDate(analysis.sessionDate ?? analysis.createdAt)}
                </Badge>
                {analysis.sourceType !== "text" && (
                  <Badge tone="outline" className="bg-card">
                    <Mic /> {analysis.sourceName || analysis.sourceType}
                    {analysis.mediaInfo?.durationSec ? ` · ${Math.round(analysis.mediaInfo.durationSec / 60)} min` : ""}
                  </Badge>
                )}
                <Badge tone="outline" className="bg-card">
                  <Cpu /> {analysis.model}
                  {meta?.provider === "mock" ? " (mock)" : ""}
                </Badge>
              </div>
            </div>
            <AnalysisActions id={analysis.id} title={analysis.title} completed />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {/* Overblik */}
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Workflow} label="Strategier" value={r.cognitive_strategies.strategies.length} hint={`${r.cognitive_strategies.strategies.filter((s) => s.transferable).length} overførbare`} />
          <StatTile icon={ShieldCheck} label="Styrkende overbevisninger" value={r.enabling_beliefs.beliefs.length} />
          <StatTile icon={ShieldAlert} label="Begrænsende overbevisninger" value={r.disenabling_beliefs.beliefs.length} />
          <StatTile icon={Gauge} label="Næste spørgsmål" value={r.gaps_and_next_questions.next_questions.length} hint={`${r.gaps_and_next_questions.gaps.length} mangler i modellen`} />
        </dl>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-sans text-sm font-bold">VAKOG-profil</h3>
              <span className="text-xs text-muted-foreground">Primært: {REP_SYSTEM_LABEL[r.vakog.primary_system]}</span>
            </div>
            <div className="mt-4 space-y-4">
              <DistributionBar distribution={r.vakog.distribution} highlight={r.vakog.primary_system} />
              <VakogLegend distribution={r.vakog.distribution} primary={r.vakog.primary_system} />
              {meta?.lexicon && meta.lexicon.total > 0 && (
                <div className="border-t pt-3">
                  <DistributionBar size="sm" distribution={meta.lexicon.distribution} label={`Leksikon-krydstjek · ${meta.lexicon.total} prædikater talt`} />
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">6 Human Needs</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dominerende: {r.values_and_6_human_needs.dominant_needs.map((n) => HUMAN_NEED_LABEL[n]).join(" & ") || "—"}
            </p>
            <NeedsRadar data={needsData} series={[{ key: "s0", name: "Score", color: "var(--series-1)" }]} height={250} />
          </Card>
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-sans text-sm font-bold">Meta-programmer</h3>
              <span className="text-xs text-muted-foreground">{r.meta_programs.programs.length} identificeret</span>
            </div>
            <div className="mt-3 divide-y">
              {programs.length ? (
                programs.map((p) => (
                  <MetaProgramScale key={p.program} name={META_PROGRAMS[p.program].name} poles={META_PROGRAMS[p.program].poles} leaning={p.leaning} strength={p.strength} />
                ))
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Ingen meta-programmer med belæg.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Sammenfatning */}
        <Card className="mt-4 overflow-hidden">
          <div className="grid lg:grid-cols-[1.4fr_1fr]">
            <div className="p-6 sm:p-8">
              <h2 className="text-2xl">Sammenfatning</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-foreground/90 text-pretty">{r.summary.overview}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-semibold">Kildegrundlag:</span> {r.summary.source_quality}
              </p>
            </div>
            <div className="border-t bg-muted/40 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <h3 className="eyebrow text-muted-foreground">Nøgleindsigter</h3>
              <ul className="mt-4 space-y-3.5">
                {r.summary.key_insights.map((k, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-[7px] size-2 shrink-0 rotate-45 bg-primary" />
                    <span className="leading-snug text-pretty">{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {/* Sektioner */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <ReportToc
                sections={doc.sections
                  .filter((s) => s.key !== "summary")
                  .map((s) => ({ key: s.key, title: s.title, icon: categories.find((c) => c.key === s.key)?.icon ?? "sparkles", count: counts[s.key] ?? 0 }))}
              />
            </div>
          </aside>
          <div className="min-w-0 space-y-6">
            {doc.sections
              .filter((s) => s.key !== "summary")
              .map((s) => {
                const cat = categories.find((c) => c.key === s.key)!;
                return (
                  <section key={s.key} id={s.key} className="scroll-mt-6">
                    <Card className="p-6 sm:p-8">
                      <header className="mb-6 flex items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
                          <CategoryIcon name={cat.icon} className="size-5 text-secondary-foreground" />
                        </span>
                        <div>
                          <h2 className="text-2xl">{s.title}</h2>
                          <p className="mt-1 text-sm text-muted-foreground text-pretty">{s.description}</p>
                        </div>
                      </header>
                      <ReportBlocks blocks={s.blocks} ctx={{ analysisId: analysis.id, sectionKey: s.key, sectionTitle: s.title, savable: true }} />
                    </Card>
                  </section>
                );
              })}

            <details className="group rounded-2xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-6 font-semibold">
                <BookOpenText className="size-5 text-primary" /> Transskript
                <span className="text-sm font-normal text-muted-foreground">
                  {formatNumber(analysis.transcript.length)} tegn
                  {meta ? ` · ${formatNumber(meta.input_tokens)} input- / ${formatNumber(meta.output_tokens)} output-tokens` : ""}
                </span>
                <ChevronRight className="ml-auto size-4 transition group-open:rotate-90" />
              </summary>
              <div className="max-h-[480px] overflow-y-auto border-t px-6 py-5">
                <pre className="whitespace-pre-wrap font-mono text-[13px] leading-6 text-foreground/85">{analysis.transcript}</pre>
              </div>
            </details>
            {meta?.fixes?.length ? (
              <p className="text-xs text-muted-foreground">
                Deterministiske rettelser efter validering: {meta.fixes.length}
                {meta.repaired ? " · én reparationsrunde blev kørt" : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
