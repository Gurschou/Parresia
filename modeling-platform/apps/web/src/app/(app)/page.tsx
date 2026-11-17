import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileText, Library, Sparkles, Users, Workflow } from "lucide-react";
import { PageContainer } from "@/components/app/page-header";
import { StatusBadge } from "@/components/analysis/status-badge";
import { DistributionBar } from "@/components/report/overview-charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { listAnalyses } from "@/server/analyses";
import { getDashboard } from "@/server/dashboard";
import { listExperts } from "@/server/experts";
import { getPatternSuggestions, listPatterns } from "@/server/patterns";
import { requireUser } from "@/server/session";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Oversigt" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", timeZone: "Europe/Copenhagen" }).format(new Date()));
  return h < 5 ? "God nat" : h < 10 ? "Godmorgen" : h < 12 ? "God formiddag" : h < 18 ? "God eftermiddag" : "God aften";
}

export default async function HomePage() {
  const user = await requireUser();
  const [analyses, experts, dash, patterns, suggestions] = await Promise.all([
    listAnalyses(user.id, { limit: 8 }),
    listExperts(user.id),
    getDashboard(user.id),
    listPatterns(user.id),
    getPatternSuggestions(user.id),
  ]);
  const running = analyses.filter((a) => a.status !== "completed" && a.status !== "failed");
  const firstName = user.name.split(" ")[0];

  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-aurora" />
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <PageContainer className="relative pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Oversigt</p>
          <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
            {greeting()}, <span className="italic">{firstName}</span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground text-pretty">
            {dash.totals.analyses
              ? `Du har modelleret ${dash.totals.experts} ${dash.totals.experts === 1 ? "person" : "personer"} gennem ${dash.totals.analyses} analyser. Her er, hvad der sker.`
              : "Start med at analysere et interview — så bygger platformen modeller, mønstre og indsigter op over tid."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/analyses/new">
                <Sparkles /> Ny analyse
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">
                Se dashboard <ArrowRight />
              </Link>
            </Button>
          </div>
        </PageContainer>
      </section>

      <PageContainer>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Analyser", value: dash.totals.analyses, icon: FileText, href: "/analyses" },
            { label: "Eksperter", value: experts.length, icon: Users, href: "/experts" },
            { label: "Strategier fundet", value: dash.totals.strategies, icon: Workflow, href: "/dashboard" },
            { label: "Mønstre i biblioteket", value: patterns.length, icon: Library, href: "/patterns" },
          ].map((k) => (
            <Link key={k.label} href={k.href} className="group">
              <Card className="p-5 transition group-hover:-translate-y-0.5 group-hover:border-primary/30">
                <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                  {k.label}
                  <k.icon className="size-4" />
                </div>
                <div className="mt-3 font-serif text-4xl font-semibold tabular-nums">{k.value}</div>
              </Card>
            </Link>
          ))}
        </div>

        {running.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="font-sans text-sm font-bold">I gang lige nu</h2>
            <div className="mt-3 divide-y">
              {running.map((a) => (
                <Link key={a.id} href={`/analyses/${a.id}`} className="flex items-center gap-4 py-3 hover:opacity-80">
                  <StatusBadge status={a.status} />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                  <span className="hidden text-sm text-muted-foreground sm:block">{a.stageMessage}</span>
                  <Progress value={a.progress} className="w-28" />
                </Link>
              ))}
            </div>
          </Card>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card className="p-0">
            <div className="flex items-center justify-between p-5 pb-3">
              <h2 className="text-xl font-semibold">Seneste analyser</h2>
              <Link href="/analyses" className="text-sm font-semibold text-primary hover:underline">
                Se alle
              </Link>
            </div>
            {analyses.length === 0 ? (
              <div className="px-5 pb-8 pt-2">
                <ol className="grid gap-3 sm:grid-cols-3">
                  {["Indsæt et transskript eller upload en optagelse", "Claude udtrækker den fulde adfærdsmodel", "Sammenlign eksperter og byg dit mønsterbibliotek"].map((t, i) => (
                    <li key={t} className="rounded-xl border bg-muted/40 p-4 text-sm">
                      <span className="mb-2 flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ol>
                <Button asChild className="mt-5">
                  <Link href="/analyses/new">
                    Prøv med eksempel-interviewet <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {analyses.map((a) => (
                  <li key={a.id}>
                    <Link href={`/analyses/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{a.title}</div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {a.expertName ?? "Ingen ekspert"} · {relativeTime(a.createdAt)}
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="font-sans text-sm font-bold">Samlet VAKOG-profil</h2>
              <p className="mt-1 text-xs text-muted-foreground">Gennemsnit på tværs af alle færdige analyser</p>
              <div className="mt-4">
                {dash.totals.analyses ? (
                  <DistributionBar distribution={dash.vakogAverage} />
                ) : (
                  <div className="h-4 rounded-full bg-muted" />
                )}
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-sm font-bold">Fælles mønstre</h2>
                <Link href="/patterns?tab=forslag" className="text-xs font-semibold text-primary hover:underline">
                  Se alle
                </Link>
              </div>
              {suggestions.length ? (
                <ul className="mt-3 space-y-2.5">
                  {suggestions.slice(0, 4).map((s) => (
                    <li key={s.key} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                      <div className="text-sm font-semibold leading-snug">{s.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.expertCount} eksperter · {s.occurrences.length} forekomster
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Når du har analyseret mindst to eksperter, finder platformen automatisk mønstre, de har til fælles.
                </p>
              )}
            </Card>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
