import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { REP_SYSTEMS, REP_SYSTEM_LABEL } from "@bm/core";
import { PageContainer } from "@/components/app/page-header";
import { StatusBadge } from "@/components/analysis/status-badge";
import { DistributionBar } from "@/components/report/overview-charts";
import { EXAMPLE_SPECIMEN, Specimen, pickSpecimen, type SpecimenData } from "@/components/report/specimen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAnalysis, listAnalyses } from "@/server/analyses";
import { getDashboard } from "@/server/dashboard";
import { getBeliefMatchView } from "@/server/belief-matches";
import { MatchLine } from "@/components/beliefs/match-parts";
import { listExperts } from "@/server/experts";
import { getPatternSuggestions, listPatterns } from "@/server/patterns";
import { requireUser } from "@/server/session";
import { formatDate, initials, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Oversigt" };

/** Første færdige analyse med et fund, der viser vejen fra citat til strategi. */
async function findSpecimen(userId: string, ids: string[]): Promise<SpecimenData | null> {
  for (const id of ids.slice(0, 4)) {
    const a = await getAnalysis(userId, id).catch(() => null);
    const pick = pickSpecimen(a?.result);
    if (a && pick) {
      return {
        quote: pick.quote,
        strategy: pick.strategy,
        expertName: a.expert?.name ?? a.result?.summary.subject ?? "Ukendt",
        dateLabel: formatDate(a.sessionDate ?? a.createdAt, { day: "numeric", month: "short" }),
        href: `/analyses/${a.id}`,
      };
    }
  }
  return null;
}

const SERIES = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--series-${(h % 8) + 1})`;
};

export default async function HomePage() {
  const user = await requireUser();
  const [analyses, experts, dash, patterns, suggestions, beliefs] = await Promise.all([
    listAnalyses(user.id, { limit: 8 }),
    listExperts(user.id),
    getDashboard(user.id),
    listPatterns(user.id),
    getPatternSuggestions(user.id),
    getBeliefMatchView(user.id),
  ]);
  const selfPerson = beliefs.persons.find((p) => p.isSelf);
  const running = analyses.filter((a) => a.status !== "completed" && a.status !== "failed");
  const specimen = (await findSpecimen(user.id, analyses.filter((a) => a.status === "completed").map((a) => a.id))) ?? EXAMPLE_SPECIMEN;
  const primary = [...REP_SYSTEMS].sort((x, y) => dash.vakogAverage[y] - dash.vakogAverage[x])[0]!;

  return (
    <div>
      <section className="border-b">
        <PageContainer className="grid items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-16">
          <div className="min-w-0">
            <div className="eyebrow text-primary">Advanced Behavioral Modeling</div>
            <h1 className="mt-4 text-[2.6rem] leading-[0.98] sm:text-6xl">
              Fra det, de siger,
              <br />
              til det, de gør.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground text-pretty">
              {dash.totals.analyses
                ? `${user.name.split(" ")[0]}, du har modelleret ${dash.totals.experts} ${dash.totals.experts === 1 ? "person" : "personer"} gennem ${dash.totals.analyses} ${dash.totals.analyses === 1 ? "analyse" : "analyser"}. Hvert fund peger tilbage på et ordret citat.`
                : "Indsæt et interview eller upload en optagelse med en, der mestrer noget. Claude udtrækker strategier, overbevisninger, værdier, meta-programmer og VAKOG, og hvert fund peger tilbage på et ordret citat."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/analyses/new">
                  <Sparkles /> Ny analyse
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard">
                  Se mønstrene <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
          <Specimen data={specimen} />
        </PageContainer>
      </section>

      <PageContainer>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {[
            { label: "Analyser", value: dash.totals.analyses, href: "/analyses" },
            { label: "Eksperter", value: experts.length, href: "/experts" },
            { label: "Strategier fundet", value: dash.totals.strategies, href: "/dashboard" },
            { label: "Mønstre i biblioteket", value: patterns.length, href: "/patterns" },
          ].map((k) => (
            <Link key={k.label} href={k.href} className="group flex items-end justify-between gap-3 bg-card px-5 py-4 transition hover:bg-muted/60">
              <div className="min-w-0">
                <dt className="truncate text-[13px] text-muted-foreground">{k.label}</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums tracking-[-0.03em]">{k.value}</dd>
              </div>
              <ArrowUpRight className="mb-1 size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </dl>

        {running.length > 0 && (
          <Card className="mt-6 p-5">
            <h2 className="text-base">I gang lige nu</h2>
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

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl">Seneste analyser</h2>
              <Link href="/analyses" className="text-sm font-semibold text-primary hover:underline">
                Alle analyser
              </Link>
            </div>
            {analyses.length === 0 ? (
              <Card className="p-6">
                <ul className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Indsæt eller upload", "Et transskript, en tekstfil eller en lyd-/videooptagelse."],
                    ["Claude modellerer", "Strategier, overbevisninger, værdier, meta-programmer og VAKOG."],
                    ["Sammenlign og saml", "Fælles mønstre på tværs af eksperter i dit bibliotek."],
                  ].map(([t, d]) => (
                    <li key={t} className="rounded-lg border bg-muted/40 p-4 text-sm">
                      <div className="font-semibold">{t}</div>
                      <div className="mt-1 text-muted-foreground">{d}</div>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-5">
                  <Link href="/analyses/new">
                    Prøv med eksempel-interviewet <ArrowRight />
                  </Link>
                </Button>
              </Card>
            ) : (
              <Card className="overflow-hidden p-0">
                <ul className="divide-y">
                  {analyses.map((a) => (
                    <li key={a.id}>
                      <Link href={`/analyses/${a.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-muted/50 sm:px-5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: SERIES(a.expertName ?? a.title) }}>
                          {initials(a.expertName ?? a.title)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{a.title}</div>
                          <div className="mt-0.5 truncate text-sm text-muted-foreground">
                            {a.expertName ?? "Ingen ekspert"} · {relativeTime(a.createdAt)}
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-8">
            {(selfPerson || beliefs.total > 0) && (
              <section>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-xl">{selfPerson ? "Passer til dig" : "Overbevisnings-match"}</h2>
                  <Link href="/beliefs" className="text-sm font-semibold text-primary hover:underline">
                    Alle match
                  </Link>
                </div>
                <Card className="p-5">
                  {selfPerson ? (
                    beliefs.incoming.length ? (
                      <ul className="space-y-4">
                        {beliefs.incoming.slice(0, 3).map((m) => (
                          <li key={m.id}>
                            <MatchLine match={m} side="from" />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Endnu ingen af de andres overbevisninger, der passer tydeligt til dig. Matchet opdateres, hver gang et nyt transskript kommer ind.</p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground text-pretty">
                      {beliefs.total} match mellem {beliefs.persons.length} personer. Markér din egen profil med “Markér som mig” for at se, hvad der passer til dig.
                    </p>
                  )}
                </Card>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-xl">Samlet VAKOG-profil</h2>
              <Card className="p-5">
                {dash.totals.analyses ? (
                  <>
                    <div className="mb-3 flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Gennemsnit af {dash.totals.analyses} analyser</span>
                      <span className="font-semibold">{REP_SYSTEM_LABEL[primary]}</span>
                    </div>
                    <DistributionBar distribution={dash.vakogAverage} />
                  </>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">Vises, når din første analyse er færdig.</p>
                    <div className="h-4 rounded-full bg-muted" />
                  </>
                )}
              </Card>
            </section>
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xl">Fælles mønstre</h2>
                <Link href="/patterns?tab=forslag" className="text-sm font-semibold text-primary hover:underline">
                  Alle mønstre
                </Link>
              </div>
              {suggestions.length ? (
                <ul className="flex flex-col gap-2">
                  {suggestions.slice(0, 4).map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
                      <span className="min-w-0 text-sm font-semibold leading-snug">{s.title}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{s.expertCount} eksp.</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Når du har analyseret mindst to eksperter, finder platformen automatisk mønstre, de har til fælles.</p>
              )}
            </section>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
