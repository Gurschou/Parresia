import type { Metadata } from "next";
import { BarChart3, FileText, ShieldAlert, ShieldCheck, Users, Workflow } from "lucide-react";
import { HUMAN_NEEDS, HUMAN_NEED_LABEL, REP_SYSTEMS, REP_SYSTEM_LABEL, STRATEGY_TYPE_LABEL } from "@bm/core";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { BeliefsOverTime, HBarList, MetaProgramDiverging } from "@/components/dashboard/dashboard-charts";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DistributionBar, NeedsRadar, VakogLegend } from "@/components/report/overview-charts";
import { Card } from "@/components/ui/card";
import { getDashboard } from "@/server/dashboard";
import { listExperts, listProjects } from "@/server/experts";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

function Panel({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <h2 className="font-sans text-sm font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ projectId?: string; expertId?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [d, experts, projects] = await Promise.all([
    getDashboard(user.id, { projectId: sp.projectId, expertId: sp.expertId }),
    listExperts(user.id),
    listProjects(user.id),
  ]);
  const primary = [...REP_SYSTEMS].sort((a, b) => d.vakogAverage[b] - d.vakogAverage[a])[0] ?? "V";
  const needsExperts = d.needsByExpert.slice(0, 4);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Dashboard"
        title="Mønstre på tværs af modeller"
        description="Meta-programmer, VAKOG, værdier, behov og overbevisninger — over tid og på tværs af eksperter."
        actions={<DashboardFilters experts={experts.map((e) => ({ id: e.id, name: e.name }))} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />}
      />
      {d.totals.analyses === 0 ? (
        <EmptyState icon={BarChart3} title="Ingen data endnu" description="Dashboardet fyldes, når du har færdige analyser (med de valgte filtre)." />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-5">
            {[
              { label: "Analyser", value: d.totals.analyses, icon: FileText },
              { label: "Eksperter", value: d.totals.experts, icon: Users },
              { label: "Strategier", value: d.totals.strategies, icon: Workflow },
              { label: "Styrkende", value: d.totals.enablingBeliefs, icon: ShieldCheck },
              { label: "Begrænsende", value: d.totals.disenablingBeliefs, icon: ShieldAlert },
            ].map((k) => (
              <div key={k.label} className="min-w-0 bg-card px-5 py-4 last:col-span-2 lg:last:col-span-1">
                <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <k.icon className="size-4 shrink-0" /> {k.label}
                </dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums tracking-[-0.03em]">{k.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="VAKOG-fordeling" description={`Gennemsnit · primært ${REP_SYSTEM_LABEL[primary].toLowerCase()}`}>
              <DistributionBar distribution={d.vakogAverage} highlight={primary} />
              <VakogLegend distribution={d.vakogAverage} primary={primary} />
              {d.vakogByExpert.length > 1 && (
                <div className="mt-5 space-y-3 border-t pt-4">
                  <div className="text-xs font-semibold text-muted-foreground">Pr. ekspert</div>
                  {d.vakogByExpert.map((e) => (
                    <DistributionBar key={e.expert} size="sm" label={`${e.expert} · ${e.analyses} ${e.analyses === 1 ? "analyse" : "analyser"}`} distribution={Object.fromEntries(REP_SYSTEMS.map((s) => [s, e[s]]))} />
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Meta-programmer" description="Tendens på tværs af analyser (antal: pol A · balanceret · pol B)">
              <MetaProgramDiverging rows={d.metaPrograms} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="6 Human Needs" description={needsExperts.length > 1 ? "Pr. ekspert (op til 4)" : "Gennemsnit"} className="lg:col-span-1">
              <NeedsRadar
                height={270}
                data={HUMAN_NEEDS.map(
                  (n): Record<string, string | number> =>
                    needsExperts.length > 1
                      ? { need: HUMAN_NEED_LABEL[n], ...Object.fromEntries(needsExperts.map((e, i) => [`s${i}`, e[n]])) }
                      : { need: HUMAN_NEED_LABEL[n], s0: d.needsAverage[n] },
                )}
                series={
                  needsExperts.length > 1
                    ? needsExperts.map((e, i) => ({ key: `s${i}`, name: e.expert, color: `var(--series-${i + 1})` }))
                    : [{ key: "s0", name: "Gennemsnit", color: "var(--series-1)" }]
                }
              />
              {needsExperts.length > 1 && (
                <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                  {needsExperts.map((e, i) => (
                    <span key={e.expert} className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ background: `var(--series-${i + 1})` }} /> {e.expert}
                    </span>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Overbevisninger over tid" description="Antal styrkende og begrænsende pr. session" className="lg:col-span-2">
              <BeliefsOverTime data={d.beliefsOverTime} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Top-værdier" description="Sorteret efter antal eksperter" className="lg:col-span-2">
              {d.topValues.length ? (
                <HBarList items={d.topValues.map((v) => ({ label: v.value, value: v.count, hint: `${v.experts} ${v.experts === 1 ? "ekspert" : "eksperter"} · ${v.direction === "toward" ? "mod" : "væk fra"}` }))} />
              ) : (
                <p className="text-sm text-muted-foreground">Ingen værdier.</p>
              )}
            </Panel>
            <Panel title="Strategityper">
              <HBarList
                items={Object.entries(d.strategyTypes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => ({ label: STRATEGY_TYPE_LABEL[k as keyof typeof STRATEGY_TYPE_LABEL] ?? k, value: v }))}
              />
              <div className="mt-5 border-t pt-4">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Dominerende behov (antal analyser)</div>
                <HBarList
                  items={HUMAN_NEEDS.filter((n) => d.dominantNeeds[n] > 0)
                    .sort((a, b) => d.dominantNeeds[b] - d.dominantNeeds[a])
                    .map((n) => ({ label: HUMAN_NEED_LABEL[n], value: d.dominantNeeds[n] }))}
                />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
