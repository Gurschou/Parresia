import Link from "next/link";
import { ArrowRight, Loader2, Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalysisMatches } from "@/server/belief-matches";
import { AutoRefresh, RerunMatchButton } from "./match-actions";
import { MatchLine, PersonAvatar, who } from "./match-parts";

/**
 * Rapportens felt for overbevisnings-match: hvad fra de andre i biblioteket
 * passer til personen, og hvad personen kan give videre. Opdaterer sig selv,
 * mens matchet kører i baggrunden.
 */
export async function AnalysisMatchPanel({ userId, analysisId }: { userId: string; analysisId: string }) {
  const data = await getAnalysisMatches(userId, analysisId);
  const status = data.run?.status;
  const active = status === "pending" || status === "running";
  const w = who(data.person);
  const href = data.person ? `/beliefs?person=${encodeURIComponent(data.person.key)}` : "/beliefs";
  const sharedWith = [...new Map(data.shared.map((m) => [m.from.personKey === data.person?.key ? m.to.name : m.from.name, m])).keys()];

  return (
    <Card id="belief_match" className="mt-4 scroll-mt-6 overflow-hidden">
      <AutoRefresh active={active} />
      <header className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
            <Puzzle className="size-5 text-secondary-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">Overbevisnings-match</h2>
              {status === "done" && data.run?.source && (
                <Badge tone="outline">{data.run.source === "claude" ? "Claude" : "Tekstbaseret"}</Badge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
              Overbevisningerne her er sammenlignet med alle andre i dit bibliotek, begge veje: hvad fra de andre passer til {w.obj}, og hvad {data.person?.isSelf ? "du" : w.obj} kan give videre.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === "done" && (
            <Link href={href} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-secondary">
              Se alle match <ArrowRight className="size-4" />
            </Link>
          )}
          {!active && <RerunMatchButton analysisId={analysisId} label={data.run ? "Kør igen" : "Find overbevisninger, der passer"} variant={data.run ? "ghost" : "default"} />}
        </div>
      </header>

      {active ? (
        <div className="p-6 sm:p-8" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin text-primary" /> Matcher {w.poss} overbevisninger mod resten af biblioteket …
          </p>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {[0, 1].map((c) => (
              <div key={c} className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="size-7 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : !data.run ? (
        <p className="p-6 text-sm text-muted-foreground sm:p-8">Denne analyse er ikke matchet endnu. Find ud af, hvilke overbevisninger fra de andre i biblioteket der passer, og omvendt.</p>
      ) : status === "failed" ? (
        <p className="p-6 text-sm text-negative sm:p-8">Matchet fejlede: {data.run.note || "ukendt fejl"}</p>
      ) : data.run.personCount === 0 ? (
        <p className="p-6 text-sm text-muted-foreground sm:p-8">
          Der er ingen andre personer i biblioteket endnu. Når du analyserer den næste, finder platformen automatisk de overbevisninger, der passer mellem jer.
        </p>
      ) : (
        <div className="p-6 sm:p-8">
          {data.run.summary && <p className="max-w-3xl text-[17px] leading-relaxed text-pretty">{data.run.summary}</p>}
          {data.run.note && <p className="mt-2 text-xs text-muted-foreground">{data.run.note}</p>}
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <section>
              <h3 className="eyebrow mb-4 text-primary">Passer til {w.obj}</h3>
              {data.incoming.length ? (
                <ul className="space-y-4">
                  {data.incoming.slice(0, 4).map((m) => (
                    <li key={m.id}>
                      <MatchLine match={m} side="from" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen af de andres overbevisninger passer tydeligt endnu.</p>
              )}
            </section>
            <section>
              <h3 className="eyebrow mb-4 text-primary">{w.Poss} overbevisninger, der passer til andre</h3>
              {data.outgoing.length ? (
                <ul className="space-y-4">
                  {data.outgoing.slice(0, 4).map((m) => (
                    <li key={m.id}>
                      <MatchLine match={m} side="to" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen tydelige match den vej endnu.</p>
              )}
            </section>
          </div>
          {sharedWith.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center gap-3 border-t pt-5 text-sm">
              <span className="text-muted-foreground">
                {data.shared.length} fælles {data.shared.length === 1 ? "overbevisning" : "overbevisninger"} med
              </span>
              {sharedWith.map((name) => {
                const m = data.shared.find((x) => x.from.name === name || x.to.name === name)!;
                const p = m.from.name === name ? m.from : m.to;
                return (
                  <span key={name} className="inline-flex items-center gap-1.5 font-semibold">
                    <PersonAvatar name={name} seed={p.expertId ?? p.personKey} className="size-6 rounded-md text-[10px]" /> {name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
