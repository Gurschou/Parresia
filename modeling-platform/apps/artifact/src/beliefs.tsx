import * as React from "react";
import { ArrowRight, CornerDownRight, Loader2, Puzzle, RefreshCw, Sparkles, UserCheck, UserRound } from "lucide-react";
import { ANCHOR_TYPE_LABEL, BELIEF_TYPE_LABEL, MATCH_KIND_LABEL, cn, colorSlot, genitive, initials, type BeliefMatch, type MatchKind } from "./lib";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "./ui";
import { allMatches, matchesForPerson, personKey, type ViewMatch } from "./match";
import type { AppCtx } from "./app-ctx";
import type { StoredAnalysis } from "./store";

/* ───────────────────────── Byggeklodser ───────────────────────── */

/** "dig/dine" for brugeren selv, ellers navnet. */
function who(name: string, isSelf: boolean) {
  return isSelf ? { obj: "dig", subj: "du", poss: "dine", Poss: "Dine" } : { obj: name, subj: name, poss: genitive(name), Poss: genitive(name) };
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", className)} style={{ background: `var(--series-${colorSlot(name)})` }}>
      {initials(name)}
    </span>
  );
}

const KIND_TONE: Record<MatchKind, "positive" | "info" | "neutral"> = { counter: "positive", fit: "info", shared: "neutral" };
const KindBadge = ({ kind }: { kind: MatchKind }) => <Badge tone={KIND_TONE[kind]}>{MATCH_KIND_LABEL[kind]}</Badge>;

function FitMeter({ fit, className }: { fit: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Pasform ${fit} af 100`}>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, fit))}%` }} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{fit}</span>
    </span>
  );
}

const typeLabel = (t: string) => BELIEF_TYPE_LABEL[t as keyof typeof BELIEF_TYPE_LABEL] ?? t;

function MatchItem({ match: m, side, showAnchor = true, hideParty = false }: { match: BeliefMatch; side: "from" | "to"; showAnchor?: boolean; hideParty?: boolean }) {
  const other = side === "from" ? m.from : m.to;
  return (
    <article className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <KindBadge kind={m.kind} />
        <FitMeter fit={m.fit} />
        {!hideParty && (
          <a href={`#analyse-${other.analysisId}`} className="ml-auto inline-flex min-w-0 items-center gap-2 text-sm hover:text-primary">
            <span className="text-muted-foreground">{side === "from" ? "fra" : "til"}</span>
            <Avatar name={other.name} className="size-6 rounded-md text-[10px]" />
            <span className="truncate font-semibold">{other.name}</span>
          </a>
        )}
      </div>
      <h4 className="font-display text-[1.15rem] leading-snug font-bold tracking-[-0.01em] text-balance">{m.belief.statement}</h4>
      {m.belief.quote && (
        <blockquote className="said text-[15px] leading-relaxed text-foreground/85">
          <span className="marked">“{m.belief.quote}”</span>
        </blockquote>
      )}
      {m.rationale && <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{m.rationale}</p>}
      {showAnchor && m.anchor.type !== "none" && m.anchor.text && (
        <p className="flex items-start gap-2 text-sm">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="eyebrow mr-1.5 text-muted-foreground">{ANCHOR_TYPE_LABEL[m.anchor.type]}</span>
            {m.anchor.text}
          </span>
        </p>
      )}
      {m.bridgeQuestion && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-3.5 py-2.5 text-sm">
          <span className="eyebrow mr-2 text-primary">Prøv den på</span>
          <span className="text-pretty italic">{m.bridgeQuestion}</span>
        </p>
      )}
      <div className="font-mono text-[11px] text-muted-foreground">
        {m.belief.kind === "enabling" ? "Styrkende" : "Begrænsende"} · {typeLabel(m.belief.type)}
      </div>
    </article>
  );
}

function MatchLine({ match: m, side }: { match: BeliefMatch; side: "from" | "to" }) {
  const other = side === "from" ? m.from : m.to;
  return (
    <div className="flex items-start gap-3">
      <Avatar name={other.name} className="mt-0.5 size-7 rounded-md text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="text-pretty leading-snug font-semibold">{m.belief.statement}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {side === "from" ? "fra" : "til"} <span className="font-semibold text-foreground/80">{other.name}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{MATCH_KIND_LABEL[m.kind]}</span>
          {m.kind === "counter" && m.anchor.text && (
            <>
              <ArrowRight className="size-3" />
              <span className="min-w-0 truncate italic">{m.anchor.text}</span>
            </>
          )}
        </div>
      </div>
      <FitMeter fit={m.fit} className="mt-1 shrink-0" />
    </div>
  );
}

/** Alle match i biblioteket, beregnet én gang pr. ændring af data. */
function useAllMatches(ctx: AppCtx) {
  const { analyses, matchRuns } = ctx.store;
  return React.useMemo(() => allMatches(analyses, matchRuns), [analyses, matchRuns]);
}

const isSelfName = (ctx: AppCtx, name: string) => !!ctx.store.settings.selfName && personKey(ctx.store.settings.selfName) === personKey(name);

/* ───────────────────────── "Det er mig" ───────────────────────── */

export function SelfToggle({ ctx, name }: { ctx: AppCtx; name: string }) {
  const self = isSelfName(ctx, name);
  return (
    <Button
      variant={self ? "default" : "outline"}
      aria-pressed={self}
      onClick={() =>
        void ctx.store
          .saveSettings({ ...ctx.store.settings, selfName: self ? "" : name })
          .then(() => ctx.toast(self ? "Ikke længere markeret som dig" : "Markeret som dig — overbevisnings-match vises nu som “passer til dig”", "positive"))
          .catch(() => ctx.toast("Kunne ikke gemme.", "negative"))
      }
    >
      {self ? <UserCheck /> : <UserRound />} {self ? "Det er mig" : "Markér som mig"}
    </Button>
  );
}

/* ───────────────────────── Rapportens felt ───────────────────────── */

export function ReportMatchPanel({ ctx, analysis: a }: { ctx: AppCtx; analysis: StoredAnalysis }) {
  const { matches, runFor } = useAllMatches(ctx);
  const run = runFor.get(a.id);
  const running = ctx.matching.includes(a.id);
  const key = personKey(a.expertName);
  const self = isSelfName(ctx, a.expertName);
  const w = who(a.expertName, self);
  const g = React.useMemo(() => matchesForPerson(matches.filter((m) => m.id.startsWith(`${a.id}:`)), key), [matches, a.id, key]);
  const sharedWith = [...new Set(g.shared.map((m) => (m.from.personKey === key ? m.to.name : m.from.name)))];
  const stored = ctx.store.matchRuns.some((r) => r.analysisId === a.id);
  const canClaude = !!ctx.sample && !a.example;

  return (
    <Card id="belief_match" className="mt-4 overflow-hidden">
      <header className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
            <Puzzle className="size-5 text-secondary-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">Overbevisnings-match</h2>
              {run && !running && <Badge tone="outline">{run.source === "claude" ? "Claude" : "Tekstbaseret"}</Badge>}
            </div>
            <p className="text-pretty mt-1 max-w-2xl text-sm text-muted-foreground">
              Overbevisningerne her er sammenlignet med alle andre i dit bibliotek, begge veje: hvad fra de andre passer til {w.obj}, og hvad {w.subj} kan give videre.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!running && (
            <LinkButton href={`#match-${key}`} variant="ghost" size="sm" className="text-primary">
              Se alle match <ArrowRight />
            </LinkButton>
          )}
          {!running && canClaude && (
            <Button variant={stored ? "ghost" : "outline"} size="sm" onClick={() => void ctx.runMatch(a, ctx.store.analyses, true)}>
              <RefreshCw /> {stored && run?.source === "claude" ? "Kør igen" : "Match med Claude"}
            </Button>
          )}
        </div>
      </header>
      {running ? (
        <p className="flex items-center gap-2 p-6 text-sm font-semibold sm:p-8" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-primary" /> Matcher {w.poss} overbevisninger mod resten af biblioteket …
        </p>
      ) : !run || run.personCount === 0 ? (
        <p className="p-6 text-sm text-muted-foreground sm:p-8">Der er ingen andre personer i biblioteket endnu. Når du analyserer den næste, finder platformen automatisk de overbevisninger, der passer mellem jer.</p>
      ) : (
        <div className="p-6 sm:p-8">
          {run.summary && <p className="text-pretty max-w-3xl text-[17px] leading-relaxed">{run.summary}</p>}
          {run.note && <p className="mt-2 text-xs text-muted-foreground">{run.note}</p>}
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <section>
              <h3 className="eyebrow mb-4 text-primary">Passer til {w.obj}</h3>
              {g.incoming.length ? (
                <ul className="flex flex-col gap-4">
                  {g.incoming.slice(0, 4).map((m) => (
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
              {g.outgoing.length ? (
                <ul className="flex flex-col gap-4">
                  {g.outgoing.slice(0, 4).map((m) => (
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
                {g.shared.length} fælles {g.shared.length === 1 ? "overbevisning" : "overbevisninger"} med
              </span>
              {sharedWith.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 font-semibold">
                  <Avatar name={n} className="size-6 rounded-md text-[10px]" /> {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────── Siden ───────────────────────── */

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()];
}

export function BeliefMatchPage({ ctx, personSlug }: { ctx: AppCtx; personSlug?: string }) {
  const { analyses, settings } = ctx.store;
  const { matches } = useAllMatches(ctx);

  const persons = React.useMemo(() => {
    const m = new Map<string, { key: string; name: string; domain: string; list: StoredAnalysis[] }>();
    for (const a of analyses) {
      const k = personKey(a.expertName);
      const cur = m.get(k) ?? { key: k, name: a.expertName, domain: a.domain, list: [] };
      cur.list.push(a);
      m.set(k, cur);
    }
    return [...m.values()]
      .map((p) => ({ ...p, isSelf: isSelfName(ctx, p.name), ...counts(matchesForPerson(matches, p.key)) }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || (b.list[0]!.sessionDate || "").localeCompare(a.list[0]!.sessionDate || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses, matches, settings.selfName]);

  const sel = persons.find((p) => p.key === personSlug) ?? persons.find((p) => p.isSelf) ?? persons[0];
  const g = React.useMemo(() => (sel ? matchesForPerson(matches, sel.key) : { incoming: [] as ViewMatch[], outgoing: [] as ViewMatch[], shared: [] as ViewMatch[] }), [matches, sel]);
  const hasSelf = persons.some((p) => p.isSelf);
  const running = ctx.matching.length;

  if (!persons.length) {
    return (
      <div className="gutter mx-auto w-full max-w-7xl py-8 lg:py-10">
        <EmptyState icon={Puzzle} title="Ingen analyser at matche endnu" description="Analysér mindst to personer, så finder platformen automatisk de overbevisninger, der passer mellem dem." action={<LinkButton href="#ny-analyse"><Sparkles /> Ny analyse</LinkButton>} />
      </div>
    );
  }
  const w = who(sel!.name, sel!.isSelf);
  const counters = groupBy(g.incoming.filter((m) => m.kind === "counter"), (m) => m.anchor.text).sort((a, b) => Math.max(...b[1].map((m) => m.fit)) - Math.max(...a[1].map((m) => m.fit)));
  const fits = g.incoming.filter((m) => m.kind === "fit");
  const outgoing = groupBy(g.outgoing, (m) => m.to.personKey);
  const latest = sel!.list.find((a) => !a.example) ?? sel!.list[0]!;
  const latestRun = ctx.store.matchRuns.filter((r) => sel!.list.some((a) => a.id === r.analysisId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <div className="gutter mx-auto w-full max-w-7xl py-8 lg:py-10">
      <PageHeader
        eyebrow="Overbevisnings-match"
        title="Hvilke overbevisninger passer til hvem?"
        description="Hver gang et transskript er analyseret, sammenlignes personens overbevisninger med alle andre i dit bibliotek, begge veje. Det, der passer, samles her med citat, begrundelse og et spørgsmål, man kan prøve det på med."
        actions={
          ctx.sample && !latest.example ? (
            <Button variant="outline" size="sm" disabled={ctx.matching.includes(latest.id)} onClick={() => void ctx.runMatch(latest, analyses, true)}>
              {ctx.matching.includes(latest.id) ? <Loader2 className="animate-spin" /> : <RefreshCw />} Match {sel!.isSelf ? "dig" : sel!.name.split(" ")[0]} med Claude
            </Button>
          ) : undefined
        }
      />

      {running > 0 && (
        <Card className="mb-6 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
            <Loader2 className="size-4 animate-spin text-primary" /> Matcher {running} {running === 1 ? "analyse" : "analyser"} mod biblioteket lige nu …
          </p>
        </Card>
      )}

      <nav aria-label="Vælg person" className="flex flex-wrap gap-2">
        {persons.map((p) => {
          const active = p.key === sel!.key;
          return (
            <a
              key={p.key}
              href={`#match-${p.key}`}
              aria-current={active ? "true" : undefined}
              className={cn("flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 transition hover:border-primary/40", active && "border-primary bg-secondary ring-1 ring-primary")}
            >
              <Avatar name={p.name} className="size-7 rounded-md text-[10px]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm leading-tight font-semibold">
                  {p.name}
                  {p.isSelf && <Badge tone="primary" className="px-1.5 py-0 text-[10px] leading-4">Dig</Badge>}
                  {!p.isSelf && p.list.every((a) => a.example) && <Badge tone="warning" className="px-1.5 py-0 text-[10px] leading-4">Eksempel</Badge>}
                </span>
                <span className="block font-mono text-[11px] leading-tight text-muted-foreground">
                  {p.incoming} ind · {p.outgoing} ud · {p.shared} fælles
                </span>
              </span>
            </a>
          );
        })}
      </nav>

      {!hasSelf && (
        <Card className="mt-4 flex flex-col gap-3 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-pretty text-sm">
              <span className="font-semibold">Vil du se, hvad der passer til dig?</span>{" "}
              <span className="text-muted-foreground">Analysér et interview med dig selv, og tryk “Markér som mig” på din ekspertprofil. Så matches alle nye transskripter også mod dine egne overbevisninger.</span>
            </p>
          </div>
          <LinkButton href="#eksperter" variant="outline" size="sm">
            Gå til eksperter
          </LinkButton>
        </Card>
      )}

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
        <div className="flex items-center gap-4">
          <Avatar name={sel!.name} className="size-14 rounded-2xl text-lg" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-3xl">
              {sel!.name}
              {sel!.isSelf && <Badge tone="primary">Dig</Badge>}
            </h2>
            <p className="text-muted-foreground">
              {sel!.domain || "Ingen rolle angivet"} · {sel!.list.length} {sel!.list.length === 1 ? "analyse" : "analyser"}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
          {[
            { label: `Passer til ${w.obj}`, value: g.incoming.length },
            { label: "Passer til andre", value: g.outgoing.length },
            { label: "Fælles", value: g.shared.length },
          ].map((k) => (
            <div key={k.label} className="min-w-0 bg-card px-4 py-3">
              <dt className="truncate text-[13px] text-muted-foreground">{k.label}</dt>
              <dd className="mt-0.5 text-2xl font-bold tracking-[-0.03em] tabular-nums">{k.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {latestRun?.summary && (
        <p className="text-pretty mt-5 max-w-3xl text-[17px] leading-relaxed">
          {latestRun.summary} <span className="text-xs whitespace-nowrap text-muted-foreground">({latestRun.source === "claude" ? "Claude" : "tekstbaseret match"})</span>
        </p>
      )}

      <section className="mt-12">
        <h2 className="text-2xl">Passer til {w.obj}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Styrkende overbevisninger fra de andre, som kan bygge videre på det, {w.subj} allerede har.</p>
        {counters.length > 0 && (
          <>
            <h3 className="eyebrow mt-7 mb-3 text-primary">Modvægt til {w.poss} begrænsninger</h3>
            <div className="flex flex-col gap-4">
              {counters.map(([anchor, items]) => (
                <Card key={anchor} className="overflow-hidden p-0">
                  <div className="border-b bg-muted/40 px-5 py-4 sm:px-6">
                    <div className="eyebrow text-negative">Begrænsende overbevisning</div>
                    <p className="text-pretty mt-1.5 border-l-2 border-negative pl-3 font-display text-lg leading-snug font-semibold text-foreground/85">{anchor}</p>
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
            <h3 className="eyebrow mt-8 mb-3 text-primary">Passer til {w.poss} værdier, behov og mål</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {fits.map((m) => (
                <Card key={m.id} className="p-5 sm:p-6">
                  <MatchItem match={m} side="from" />
                </Card>
              ))}
            </div>
          </>
        )}
        {!counters.length && !fits.length && (
          <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {persons.length < 2 ? "Der er ingen andre personer at matche med endnu." : "Ingen af de andres overbevisninger passer tydeligt endnu. Matchet opdateres, hver gang et nyt transskript kommer ind."}
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="text-2xl">{w.Poss} overbevisninger, der passer til andre</h2>
        <p className="mt-1 text-sm text-muted-foreground">Det, {w.subj} kan give videre, og hvem det passer til.</p>
        {outgoing.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {outgoing.map(([key, items]) => (
              <Card key={key} className="overflow-hidden p-0">
                <a href={`#match-${key}`} className="flex items-center gap-3 border-b px-5 py-3.5 transition hover:bg-muted/50 sm:px-6">
                  <Avatar name={items[0]!.to.name} />
                  <span className="font-semibold">Til {items[0]!.to.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{items.length} match</span>
                </a>
                <ul className="divide-y">
                  {items.map((m) => (
                    <li key={m.id} className="px-5 py-5 sm:px-6">
                      <MatchItem match={m} side="to" hideParty />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Ingen tydelige match den vej endnu.</p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="text-2xl">Fælles overbevisninger</h2>
        <p className="mt-1 text-sm text-muted-foreground">Hvor {w.subj} og andre allerede tænker ens. Fælles begrænsninger er markeret med rødt.</p>
        {g.shared.length ? (
          <Card className="mt-6 divide-y p-0">
            {g.shared.map((m) => {
              const mineIsBelief = m.from.personKey === sel!.key;
              const other = mineIsBelief ? m.to : m.from;
              const limiting = m.belief.kind === "disenabling";
              return (
                <div key={m.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-5 sm:px-6">
                  <div className="min-w-0">
                    <div className="eyebrow text-muted-foreground">{sel!.isSelf ? "Dig" : sel!.name}</div>
                    <p className={cn("text-pretty mt-1 leading-snug font-semibold", limiting && "text-negative")}>{mineIsBelief ? m.belief.statement : m.anchor.text}</p>
                  </div>
                  <span aria-label="ligner" className="hidden font-mono text-lg text-muted-foreground sm:block">
                    ≈
                  </span>
                  <div className="min-w-0">
                    <div className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                      <Avatar name={other.name} className="size-4 rounded text-[7px]" /> {other.name}
                    </div>
                    <p className={cn("text-pretty mt-1 leading-snug font-semibold", limiting && "text-negative")}>{mineIsBelief ? m.anchor.text : m.belief.statement}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Ingen fælles overbevisninger fundet endnu.</p>
        )}
      </section>
    </div>
  );
}

function counts(g: { incoming: unknown[]; outgoing: unknown[]; shared: unknown[] }) {
  return { incoming: g.incoming.length, outgoing: g.outgoing.length, shared: g.shared.length };
}

/** Forsidens kort: hvad der passer til dig (eller et overblik, hvis du ikke har markeret dig selv). */
export function OverviewMatchCard({ ctx }: { ctx: AppCtx }) {
  const { matches } = useAllMatches(ctx);
  const selfName = ctx.store.settings.selfName;
  const selfKey = selfName ? personKey(selfName) : "";
  const hasSelf = !!selfKey && ctx.store.analyses.some((a) => personKey(a.expertName) === selfKey);
  const incoming = React.useMemo(() => (hasSelf ? matchesForPerson(matches, selfKey).incoming : []), [matches, selfKey, hasSelf]);
  if (!matches.length && !hasSelf) return null;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl">{hasSelf ? "Passer til dig" : "Overbevisnings-match"}</h2>
        <a href={hasSelf ? `#match-${selfKey}` : "#match"} className="text-sm font-semibold text-primary hover:underline">
          Alle match
        </a>
      </div>
      <div className="card p-5">
        {hasSelf ? (
          incoming.length ? (
            <ul className="flex flex-col gap-4">
              {incoming.slice(0, 3).map((m) => (
                <li key={m.id}>
                  <MatchLine match={m} side="from" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Endnu ingen af de andres overbevisninger, der passer tydeligt til dig. Matchet opdateres, hver gang et nyt transskript kommer ind.</p>
          )
        ) : (
          <p className="text-pretty text-sm text-muted-foreground">
            {matches.length} match mellem personerne i dit bibliotek. Markér din egen profil med “Markér som mig” for at se, hvad der passer til dig.
          </p>
        )}
      </div>
    </section>
  );
}
