import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Columns3, Sparkles } from "lucide-react";
import { HUMAN_NEEDS, HUMAN_NEED_LABEL, REP_SYSTEM_LABEL } from "@bm/core";
import { PageContainer } from "@/components/app/page-header";
import { StatusBadge } from "@/components/analysis/status-badge";
import { DeleteExpertButton } from "@/components/experts/delete-expert-button";
import { DistributionBar, MetaProgramScale, NeedsRadar, VakogLegend } from "@/components/report/overview-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAnalyses } from "@/server/analyses";
import { getAnalysisRecords } from "@/server/dashboard";
import { getExpert } from "@/server/experts";
import { HttpError } from "@/server/http";
import { requireUser } from "@/server/session";
import { aggregateDashboard } from "@bm/core";
import { colorSlot, formatDate, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Ekspert" };

export default async function ExpertPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let expert;
  try {
    expert = await getExpert(user.id, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  const [analyses, records] = await Promise.all([listAnalyses(user.id, { expertId: id }), getAnalysisRecords(user.id, { expertId: id })]);
  const dash = aggregateDashboard(records);
  const completedIds = records.map((r) => r.id).slice(0, 4);
  const strategies = records.flatMap((r) => r.result.cognitive_strategies.strategies.map((s) => ({ ...s, analysisId: r.id })));
  const primary = Object.entries(dash.vakogAverage).sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof REP_SYSTEM_LABEL | undefined;

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-aurora opacity-70" />
        <PageContainer className="relative pb-8">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/experts" className="hover:text-foreground">
              Eksperter
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground">{expert.name}</span>
          </nav>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-5">
              <span
                className="flex size-20 shrink-0 items-center justify-center rounded-3xl text-2xl font-bold text-white shadow-lg"
                style={{ background: `var(--series-${colorSlot(expert.id)})` }}
              >
                {initials(expert.name)}
              </span>
              <div>
                <h1 className="text-4xl font-semibold sm:text-5xl">{expert.name}</h1>
                <p className="mt-1 text-lg text-muted-foreground">{expert.role || "Ingen rolle angivet"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/analyses/new?expertId=${expert.id}`}>
                  <Sparkles /> Ny analyse
                </Link>
              </Button>
              {completedIds.length >= 2 && (
                <Button asChild variant="outline">
                  <Link href={`/compare?ids=${completedIds.join(",")}`}>
                    <Columns3 /> Sammenlign sessioner
                  </Link>
                </Button>
              )}
              <DeleteExpertButton id={expert.id} name={expert.name} />
            </div>
          </div>
          {expert.description && <p className="mt-5 max-w-3xl text-muted-foreground text-pretty">{expert.description}</p>}
        </PageContainer>
      </section>

      <PageContainer>
        {records.length === 0 ? (
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-semibold">Ingen færdige analyser endnu</h2>
            <p className="mt-2 text-muted-foreground">Analysér et interview med {expert.name} for at bygge profilen.</p>
            <Button asChild className="mt-5">
              <Link href={`/analyses/new?expertId=${expert.id}`}>Start første analyse</Link>
            </Button>
          </Card>
        ) : (
          <>
            <h2 className="mb-4 text-2xl font-semibold">
              Samlet profil <span className="font-sans text-base font-normal text-muted-foreground">· {records.length} {records.length === 1 ? "session" : "sessioner"}</span>
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5">
                <h3 className="font-sans text-sm font-bold">VAKOG (gennemsnit)</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Primært: {primary ? REP_SYSTEM_LABEL[primary] : "—"}</p>
                <div className="mt-4">
                  <DistributionBar distribution={dash.vakogAverage} highlight={primary} />
                  <VakogLegend distribution={dash.vakogAverage} primary={primary} />
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-sans text-sm font-bold">6 Human Needs (gennemsnit)</h3>
                <NeedsRadar data={HUMAN_NEEDS.map((n) => ({ need: HUMAN_NEED_LABEL[n], s0: dash.needsAverage[n] }))} series={[{ key: "s0", name: "Gennemsnit", color: "var(--series-1)" }]} height={240} />
              </Card>
              <Card className="p-5">
                <h3 className="font-sans text-sm font-bold">Meta-programmer (tendens)</h3>
                <div className="mt-2 divide-y">
                  {dash.metaPrograms.slice(0, 6).map((m) => (
                    <MetaProgramScale
                      key={m.program}
                      name={m.name}
                      poles={m.poles}
                      leaning={Math.abs(m.tendency) < 10 ? "balanced" : m.tendency < 0 ? "pole_a" : "pole_b"}
                      strength={Math.abs(m.tendency)}
                    />
                  ))}
                </div>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card className="p-5">
                <h3 className="font-sans text-sm font-bold">Strategier på tværs af sessioner</h3>
                <ul className="mt-3 divide-y">
                  {strategies.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link href={`/analyses/${s.analysisId}#cognitive_strategies`} className="font-semibold hover:text-primary">
                          {s.name}
                        </Link>
                        <div className="text-sm text-muted-foreground">{s.context}</div>
                      </div>
                      <code className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs">{s.notation}</code>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-5">
                <h3 className="font-sans text-sm font-bold">Gennemgående værdier</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dash.topValues.map((v) => (
                    <Badge key={v.value} tone={v.direction === "toward" ? "positive" : "negative"} className="px-3 py-1 text-xs">
                      {v.value}
                      {v.count > 1 && <span className="opacity-70">×{v.count}</span>}
                    </Badge>
                  ))}
                </div>
                <h3 className="mt-6 font-sans text-sm font-bold">Overbevisninger pr. session</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {dash.beliefsOverTime.map((b) => (
                    <li key={b.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-muted-foreground">{formatDate(b.date)}</span>
                      <span className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-full bg-muted">
                        <span className="bg-positive" style={{ flex: b.enabling }} />
                        <span className="bg-negative" style={{ flex: b.disenabling }} />
                      </span>
                      <span className="w-14 text-right tabular-nums text-muted-foreground">
                        {b.enabling}/{b.disenabling}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">Grøn = styrkende · rød = begrænsende</p>
              </Card>
            </div>
          </>
        )}

        <h2 className="mb-4 mt-10 text-2xl font-semibold">Sessioner</h2>
        <Card className="divide-y p-0">
          {analyses.map((a) => (
            <Link key={a.id} href={`/analyses/${a.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/50">
              <div className="w-28 shrink-0 text-sm text-muted-foreground">{formatDate(a.sessionDate ?? a.createdAt)}</div>
              <div className="min-w-0 flex-1 truncate font-semibold">{a.title}</div>
              <StatusBadge status={a.status} />
            </Link>
          ))}
          {analyses.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Ingen sessioner endnu.</p>}
        </Card>
      </PageContainer>
    </div>
  );
}
