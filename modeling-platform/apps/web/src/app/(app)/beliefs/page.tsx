import type { Metadata } from "next";
import Link from "next/link";
import { Loader2, Puzzle, Sparkles, UserRound } from "lucide-react";
import { AutoRefresh, BackfillButton, RerunMatchButton } from "@/components/beliefs/match-actions";
import { MatchItem, PersonAvatar, who } from "@/components/beliefs/match-parts";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBeliefMatchView, type StoredMatch } from "@/server/belief-matches";
import { requireUser } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overbevisnings-match" };

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()];
}

export default async function BeliefsPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const user = await requireUser();
  const { person } = await searchParams;
  const v = await getBeliefMatchView(user.id, person);
  const sel = v.selected;
  const w = who(sel);
  const hasSelf = v.persons.some((p) => p.isSelf);

  const counters = groupBy(
    v.incoming.filter((m) => m.kind === "counter"),
    (m) => m.anchor.text,
  ).sort((a, b) => Math.max(...b[1].map((m) => m.fit)) - Math.max(...a[1].map((m) => m.fit)));
  const fits = v.incoming.filter((m) => m.kind === "fit");
  const outgoing = groupBy(v.outgoing, (m) => m.to.personKey);

  return (
    <PageContainer>
      <AutoRefresh active={v.activeRuns > 0} />
      <PageHeader
        eyebrow="Overbevisnings-match"
        title="Hvilke overbevisninger passer til hvem?"
        description="Hver gang et transskript er analyseret, sammenlignes personens overbevisninger med alle andre i dit bibliotek, begge veje. Det, der passer, samles her med citat, begrundelse og et spørgsmål, man kan prøve det på med."
        actions={sel && <RerunMatchButton analysisId={sel.latestAnalysisId} label={`Kør matchet for ${sel.isSelf ? "dig" : sel.name.split(" ")[0]} igen`} />}
      />

      {(v.activeRuns > 0 || v.unmatchedAnalyses > 0) && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {v.activeRuns > 0 ? (
            <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
              <Loader2 className="size-4 animate-spin text-primary" />
              Matcher {v.activeRuns} {v.activeRuns === 1 ? "analyse" : "analyser"} mod biblioteket lige nu …
            </p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-semibold">
                  {v.unmatchedAnalyses} {v.unmatchedAnalyses === 1 ? "analyse er" : "analyser er"} ikke matchet endnu.
                </span>{" "}
                <span className="text-muted-foreground">De er fra før matchet fandtes, eller blev afbrudt.</span>
              </p>
              <BackfillButton count={v.unmatchedAnalyses} />
            </>
          )}
        </Card>
      )}

      {v.persons.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title="Ingen analyser at matche endnu"
          description="Analysér mindst to personer, så finder platformen automatisk de overbevisninger, der passer mellem dem."
          action={
            <Button asChild>
              <Link href="/analyses/new">
                <Sparkles /> Ny analyse
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Personvælger */}
          <nav aria-label="Vælg person" className="-mx-1 flex flex-wrap gap-2">
            {v.persons.map((p) => {
              const active = p.key === sel?.key;
              return (
                <Link
                  key={p.key}
                  href={`/beliefs?person=${encodeURIComponent(p.key)}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 transition hover:border-primary/40",
                    active && "border-primary bg-secondary ring-1 ring-primary",
                  )}
                >
                  <PersonAvatar name={p.name} seed={p.expertId ?? p.key} className="size-7 rounded-md text-[10px]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                      {p.name}
                      {p.isSelf && <Badge tone="primary" className="px-1.5 py-0 text-[10px] leading-4">Dig</Badge>}
                    </span>
                    <span className="block font-mono text-[11px] leading-tight text-muted-foreground">
                      {p.incoming} ind · {p.outgoing} ud · {p.shared} fælles
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {!hasSelf && (
            <Card className="mt-4 flex flex-col gap-3 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <UserRound className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-pretty">
                  <span className="font-semibold">Vil du se, hvad der passer til dig?</span>{" "}
                  <span className="text-muted-foreground">
                    Analysér et interview med dig selv, og tryk “Markér som mig” på din ekspertprofil. Så matches alle nye transskripter også mod dine egne overbevisninger.
                  </span>
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/experts">Gå til eksperter</Link>
              </Button>
            </Card>
          )}

          {sel && (
            <>
              {/* Valgt person */}
              <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
                <div className="flex items-center gap-4">
                  <PersonAvatar name={sel.name} seed={sel.expertId ?? sel.key} className="size-14 rounded-2xl text-lg" />
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-3xl">
                      {sel.name}
                      {sel.isSelf && <Badge tone="primary">Dig</Badge>}
                    </h2>
                    <p className="text-muted-foreground">
                      {sel.role || "Ingen rolle angivet"} · {sel.analysisIds.length} {sel.analysisIds.length === 1 ? "analyse" : "analyser"}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
                  {[
                    { label: `Passer til ${w.obj}`, value: v.incoming.length },
                    { label: "Passer til andre", value: v.outgoing.length },
                    { label: "Fælles", value: v.shared.length },
                  ].map((k) => (
                    <div key={k.label} className="min-w-0 bg-card px-4 py-3">
                      <dt className="truncate text-[13px] text-muted-foreground">{k.label}</dt>
                      <dd className="mt-0.5 text-2xl font-bold tabular-nums tracking-[-0.03em]">{k.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {v.latestRun?.summary && (
                <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-pretty">
                  {v.latestRun.summary}{" "}
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    ({v.latestRun.source === "claude" ? "Claude" : "tekstbaseret match"})
                  </span>
                </p>
              )}

              {/* 1. Hvad passer til personen */}
              <section className="mt-12">
                <h2 className="text-2xl">Passer til {w.obj}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Styrkende overbevisninger fra de andre, som kan bygge videre på det, {sel.isSelf ? "du" : w.obj} allerede har.</p>

                {counters.length > 0 && (
                  <>
                    <h3 className="eyebrow mb-3 mt-7 text-primary">Modvægt til {w.poss} begrænsninger</h3>
                    <div className="space-y-4">
                      {counters.map(([anchor, items]) => (
                        <Card key={anchor} className="overflow-hidden p-0">
                          <div className="border-b bg-muted/40 px-5 py-4 sm:px-6">
                            <div className="eyebrow text-negative">Begrænsende overbevisning</div>
                            <p className="mt-1.5 border-l-2 border-negative pl-3 font-display text-lg font-semibold leading-snug text-foreground/85 text-pretty">{anchor}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {items.length} {items.length === 1 ? "overbevisning" : "overbevisninger"} fra {[...new Set(items.map((m) => m.from.name))].join(", ")} kan løsne den
                            </p>
                          </div>
                          <ul className="divide-y">
                            {items.map((m) => (
                              <li key={m.id} className="px-5 py-5 sm:px-6">
                                <MatchItem match={m} side="from" showAnchor={false} />
                              </li>
                            ))}
                          </ul>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {fits.length > 0 && (
                  <>
                    <h3 className="eyebrow mb-3 mt-8 text-primary">Passer til {w.poss} værdier, behov og mål</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {fits.map((m) => (
                        <Card key={m.id} className="p-5 sm:p-6">
                          <MatchItem match={m} side="from" />
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {counters.length === 0 && fits.length === 0 && (
                  <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    {v.persons.length < 2 ? "Der er ingen andre personer at matche med endnu." : "Ingen af de andres overbevisninger passer tydeligt endnu. Matchet opdateres, hver gang et nyt transskript kommer ind."}
                  </p>
                )}
              </section>

              {/* 2. Hvad personen kan give videre */}
              <section className="mt-14">
                <h2 className="text-2xl">{w.Poss} overbevisninger, der passer til andre</h2>
                <p className="mt-1 text-sm text-muted-foreground">Det, {sel.isSelf ? "du" : w.obj} kan give videre, og hvem det passer til.</p>
                {outgoing.length ? (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {outgoing.map(([key, items]) => {
                      const to = items[0]!.to;
                      return (
                        <Card key={key} className="overflow-hidden p-0">
                          <Link href={`/beliefs?person=${encodeURIComponent(key)}`} className="flex items-center gap-3 border-b px-5 py-3.5 transition hover:bg-muted/50 sm:px-6">
                            <PersonAvatar name={to.name} seed={to.expertId ?? key} />
                            <span className="font-semibold">Til {to.name}</span>
                            <span className="ml-auto font-mono text-xs text-muted-foreground">{items.length} match</span>
                          </Link>
                          <ul className="divide-y">
                            {items.map((m) => (
                              <li key={m.id} className="px-5 py-5 sm:px-6">
                                <MatchItem match={m} side="to" hideParty />
                              </li>
                            ))}
                          </ul>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Ingen tydelige match den vej endnu.</p>
                )}
              </section>

              {/* 3. Fælles */}
              <section className="mt-14">
                <h2 className="text-2xl">Fælles overbevisninger</h2>
                <p className="mt-1 text-sm text-muted-foreground">Hvor {sel.isSelf ? "du" : w.obj} og andre allerede tænker ens. Fælles begrænsninger er markeret med rødt.</p>
                {v.shared.length ? (
                  <Card className="mt-6 divide-y p-0">
                    {v.shared.map((m) => (
                      <SharedRow key={m.id} match={m} selKey={sel.key} selName={sel.isSelf ? "Dig" : sel.name} />
                    ))}
                  </Card>
                ) : (
                  <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Ingen fælles overbevisninger fundet endnu.</p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

function SharedRow({ match: m, selKey, selName }: { match: StoredMatch; selKey: string; selName: string }) {
  const mineIsBelief = m.from.personKey === selKey;
  const other = mineIsBelief ? m.to : m.from;
  const mine = mineIsBelief ? m.belief.statement : m.anchor.text;
  const theirs = mineIsBelief ? m.anchor.text : m.belief.statement;
  const limiting = m.belief.kind === "disenabling";
  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-5 sm:px-6">
      <div className="min-w-0">
        <div className="eyebrow text-muted-foreground">{selName}</div>
        <p className={cn("mt-1 font-semibold leading-snug text-pretty", limiting && "text-negative")}>{mine}</p>
      </div>
      <span aria-label="ligner" className="hidden font-mono text-lg text-muted-foreground sm:block">
        ≈
      </span>
      <div className="min-w-0">
        <div className="eyebrow flex items-center gap-1.5 text-muted-foreground">
          <PersonAvatar name={other.name} seed={other.expertId ?? other.personKey} className="size-4 rounded text-[7px]" /> {other.name}
        </div>
        <p className={cn("mt-1 font-semibold leading-snug text-pretty", limiting && "text-negative")}>{theirs}</p>
      </div>
    </div>
  );
}
