import * as React from "react";
import { ArrowRight, CircleCheck, Crosshair, FileDown, Fingerprint, Footprints, Loader2, RefreshCw, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import { buildModelingReport, cn, formatDate, renderMarkdown, slug, type ModelingMapResult } from "./lib";
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "./ui";
import { Avatar, isSelfName } from "./beliefs";
import { personKey } from "./match";
import { currentModel } from "./model";
import { CategoryIcon, ReportBlocks, Toc } from "./report";
import type { AppCtx } from "./app-ctx";
import type { StoredAnalysis, StoredModelRun } from "./store";

/* Gustavs modellering i artifactet: siden #model(-<slug>) og feltet i rapporten. */

const SECTION_ICON: Record<string, string> = {
  core: "fingerprint",
  beliefs: "shield-check",
  syntax: "workflow",
  physiology: "activity",
  language: "message-square-quote",
  needs: "heart-pulse",
  rules: "scale",
  references: "history",
  how_it_lands: "ear",
  do_not_copy: "ban",
  leverage: "crosshair",
  installation: "rocket",
  blind_spots: "circle-help",
  precision: "badge-check",
};

function PrecisionRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 80 ? "var(--positive)" : v >= 50 ? "var(--primary)" : "var(--warning)";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Præcision ${v} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="tabular absolute font-mono text-[13px] font-semibold">{v}</span>
    </span>
  );
}

function Glance({ r, compact = false }: { r: ModelingMapResult; compact?: boolean }) {
  const m = r.map;
  const a = r.audit;
  const cards = [
    { icon: Crosshair, label: "Millimeteren", text: m.leverage.point, sub: m.leverage.why },
    { icon: Footprints, label: "Første træk", text: m.installation.focus || m.installation.actions[0]?.action || "", sub: m.installation.result },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="min-w-0 rounded-xl border bg-card p-4">
          <div className="eyebrow flex items-center gap-1.5 text-primary">
            <c.icon className="size-3.5" /> {c.label}
          </div>
          <p className="text-pretty mt-2 leading-snug font-semibold">{c.text || <span className="font-normal text-muted-foreground">Fremgår ikke endnu.</span>}</p>
          {!compact && c.sub && <p className="text-pretty mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.sub}</p>}
        </div>
      ))}
      <div className="flex min-w-0 items-center gap-4 rounded-xl border bg-card p-4">
        <PrecisionRing value={a.precision} />
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-1.5 text-primary">
            <ScanSearch className="size-3.5" /> Præcision
          </div>
          <p className="mt-1 text-sm leading-snug">
            <span className="font-semibold">
              {a.findings_with_evidence} af {a.findings_total}
            </span>{" "}
            fund står på ordrette citater
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CircleCheck className="size-3" /> {a.quotes_verified} citater fundet i {a.sessions_used} {a.sessions_used === 1 ? "samtale" : "samtaler"}
          </p>
        </div>
      </div>
    </div>
  );
}

const SourceBadge = ({ run, stored }: { run: StoredModelRun; stored: boolean }) => (
  <Badge tone="outline">{run.source === "claude" ? "Claude" : stored ? "Tekstbaseret" : "Tekstbaseret · ikke gemt"}</Badge>
);

async function downloadModelPdf(ctx: AppCtx, run: StoredModelRun) {
  const [{ pdf }, { ReportPdf }] = await Promise.all([import("@react-pdf/renderer"), import("../../../packages/core/src/report/pdf-document")]);
  const doc = buildModelingReport(run.result, { generatedAt: run.createdAt, sourceLabel: run.source === "claude" ? "Claude" : "Tekstbaseret" });
  const blob = await pdf(React.createElement(ReportPdf, { doc }) as Parameters<typeof pdf>[0]).toBlob();
  return ctx.download(`modelleringskort-${slug(run.result.person.name)}.pdf`, blob);
}

/** Kan analysen modelleres med Claude (egen analyse og sample til rådighed)? */
const canClaude = (ctx: AppCtx, a: StoredAnalysis) => !!ctx.sample && !a.example;

/* ───────────────────────── Rapportens felt ───────────────────────── */

export function ReportModelPanel({ ctx, analysis: a }: { ctx: AppCtx; analysis: StoredAnalysis }) {
  const { analyses, modelRuns, settings } = ctx.store;
  const key = personKey(a.expertName);
  const own = modelRuns.find((r) => r.analysisId === a.id);
  const current = React.useMemo(() => (own ? null : currentModel(key, analyses, modelRuns, settings.selfName)), [own, key, analyses, modelRuns, settings.selfName]);
  const run = own ?? current?.run ?? null;
  const stored = !!own || !!current?.stored;
  const running = ctx.modeling.includes(a.id);
  const self = isSelfName(ctx, a.expertName);
  const name = self ? "dig" : a.expertName;

  return (
    <Card id="modeling_map" className="mt-4 overflow-hidden">
      <header className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
            <Fingerprint className="size-5 text-secondary-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">Modelleringskort</h2>
              {run && !running && <SourceBadge run={run} stored={stored} />}
            </div>
            <p className="text-pretty mt-1 max-w-2xl text-sm text-muted-foreground">
              Gustavs modellering af {name} ud fra {run && run.result.sessions.length > 1 ? `alle ${run.result.sessions.length} samtaler` : "samtalen"}: overbevisninger, mental syntaks og fysiologi oven på de seks behov, med hvert citat slået op ordret.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!running && (
            <LinkButton href={`#model-${key}`} variant="ghost" size="sm" className="text-primary">
              Åbn hele kortet <ArrowRight />
            </LinkButton>
          )}
          {!running && canClaude(ctx, a) && (
            <Button size="sm" variant={run?.source === "claude" ? "ghost" : "default"} onClick={() => void ctx.runModel(a, analyses, true)}>
              {run?.source === "claude" ? <RefreshCw /> : <Sparkles />} {run?.source === "claude" ? "Modellér igen" : "Modellér med Claude"}
            </Button>
          )}
        </div>
      </header>
      {running ? (
        <div className="p-6 sm:p-8" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin text-primary" /> Modellerer {name} ud fra alle samtalerne og slår hvert citat op …
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      ) : run ? (
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          {run.result.map.core && <p className="font-display text-xl leading-snug font-semibold text-balance">{run.result.map.core}</p>}
          <Glance r={run.result} compact />
          {run.note && <p className="text-xs text-muted-foreground">{run.note}</p>}
        </div>
      ) : null}
    </Card>
  );
}

/* ───────────────────────── Siden ───────────────────────── */

export function ModelingPage({ ctx, personSlug }: { ctx: AppCtx; personSlug?: string }) {
  const { analyses, modelRuns, settings } = ctx.store;
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const persons = React.useMemo(() => {
    const m = new Map<string, { key: string; name: string; domain: string; list: StoredAnalysis[] }>();
    for (const a of analyses) {
      const k = personKey(a.expertName);
      const cur = m.get(k) ?? { key: k, name: a.expertName, domain: a.domain, list: [] };
      cur.list.push(a);
      m.set(k, cur);
    }
    return [...m.values()]
      .map((p) => {
        const ids = new Set(p.list.map((a) => a.id));
        const latest = modelRuns.filter((r) => ids.has(r.analysisId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return { ...p, isSelf: isSelfName(ctx, p.name), latest };
      })
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || (b.list[0]!.sessionDate || "").localeCompare(a.list[0]!.sessionDate || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses, modelRuns, settings.selfName]);

  const sel = persons.find((p) => p.key === personSlug) ?? persons.find((p) => p.isSelf) ?? persons[0];
  const current = React.useMemo(() => (sel ? currentModel(sel.key, analyses, modelRuns, settings.selfName) : null), [sel, analyses, modelRuns, settings.selfName]);

  if (!sel || !current) {
    return (
      <div className="gutter mx-auto w-full max-w-7xl py-8 lg:py-10">
        <EmptyState icon={Fingerprint} title="Ingen personer at modellere endnu" description="Analysér et transskript, så bygges personens modelleringskort bagefter." action={<LinkButton href="#ny-analyse"><Sparkles /> Ny analyse</LinkButton>} />
      </div>
    );
  }

  const { run, stored } = current;
  const r = run.result;
  const doc = buildModelingReport(r, { generatedAt: run.createdAt });
  const sections = doc.sections.filter((s) => s.key !== "core");
  const m = r.map;
  const count: Record<string, number> = {
    beliefs: m.beliefs.length,
    syntax: m.syntax.steps.length,
    physiology: m.physiology.length,
    language: m.language.length,
    needs: m.needs.length,
    rules: m.rules.length,
    references: m.references.capability.length + m.references.danger.length + (m.references.formative.description ? 1 : 0),
    do_not_copy: m.do_not_copy.length,
    installation: m.installation.actions.length,
    blind_spots: m.blind_spots.length,
  };
  const latest = sel.list.find((a) => !a.example) ?? sel.list[0]!;
  const running = ctx.modeling.length > 0;
  const first = sel.isSelf ? "dig" : sel.name.split(" ")[0];

  return (
    <div className="gutter mx-auto w-full max-w-7xl py-8 lg:py-10">
      <PageHeader
        eyebrow="Gustavs modellering"
        title="Hvordan er personen skruet sammen?"
        description="Hver person modelleres ud fra alle sine samtaler: overbevisninger, mental syntaks og fysiologi oven på de seks behov, til en installationsplan. Hvert citat slås op ordret i transskripterne, og sikkerheden følger belægget."
        actions={
          <>
            {ctx.canDownload && (
              <>
                <Button variant="ghost" size="sm" onClick={() => void ctx.download(`modelleringskort-${slug(sel.name)}.md`, renderMarkdown(doc))}>
                  <FileDown /> Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pdfBusy}
                  onClick={async () => {
                    setPdfBusy(true);
                    await downloadModelPdf(ctx, run).catch(() => ctx.toast("PDF'en kunne ikke laves.", "negative"));
                    setPdfBusy(false);
                  }}
                >
                  <FileDown /> {pdfBusy ? "Laver PDF…" : "PDF"}
                </Button>
              </>
            )}
            {canClaude(ctx, latest) && (
              <Button size="sm" variant={run.source === "claude" ? "outline" : "default"} disabled={ctx.modeling.includes(latest.id)} onClick={() => void ctx.runModel(latest, analyses, true)}>
                {ctx.modeling.includes(latest.id) ? <Loader2 className="animate-spin" /> : run.source === "claude" ? <RefreshCw /> : <Sparkles />} Modellér {first} med Claude
              </Button>
            )}
          </>
        }
      />

      {running && (
        <Card className="mb-6 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
            <Loader2 className="size-4 animate-spin text-primary" /> Modellerer ud fra alle samtalerne og slår hvert citat op lige nu …
          </p>
        </Card>
      )}

      <nav aria-label="Vælg person" className="flex flex-wrap gap-2">
        {persons.map((p) => {
          const active = p.key === sel.key;
          return (
            <a
              key={p.key}
              href={`#model-${p.key}`}
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
                  {p.list.length} {p.list.length === 1 ? "samtale" : "samtaler"} · {p.latest ? `${p.latest.result.audit.precision} % belagt` : "tekstbaseret"}
                </span>
              </span>
            </a>
          );
        })}
      </nav>

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={sel.name} className="size-14 rounded-2xl text-lg" />
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-3xl">
              {sel.name}
              {sel.isSelf && <Badge tone="primary">Dig</Badge>}
              <SourceBadge run={run} stored={stored} />
            </h2>
            <p className="text-muted-foreground">
              Bygget af {r.sessions.length} {r.sessions.length === 1 ? "samtale" : "samtaler"}
              {stored ? ` · ${formatDate(run.createdAt)}` : ""}
              {sel.domain ? ` · ${sel.domain}` : ""}
            </p>
          </div>
        </div>
        {m.core && <blockquote className="font-display mt-8 max-w-4xl border-l-4 border-primary pl-5 text-2xl leading-snug font-semibold tracking-[-0.01em] text-balance sm:text-[1.9rem]">{m.core}</blockquote>}
        {m.result_modeled && (
          <p className="text-pretty mt-4 max-w-3xl text-muted-foreground">
            <span className="eyebrow mr-2 text-primary">Resultatet der modelleres</span>
            {m.result_modeled}
          </p>
        )}
        {(run.note || (!stored && canClaude(ctx, latest))) && (
          <p className="mt-4 flex max-w-3xl items-start gap-2 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            {run.note || "Kortet er tekstbaseret. Modellér med Claude for et præcist kort efter hele metoden."}
          </p>
        )}
        <div className="mt-8">
          <Glance r={r} />
        </div>
        {m.tension.text && (
          <div className="mt-3 rounded-xl border bg-muted/40 p-4">
            <div className="eyebrow text-warning">Spændingen</div>
            <p className="text-pretty mt-1.5 leading-relaxed">{m.tension.text}</p>
            {m.tension.quotes[0] && (
              <p className="said mt-2 text-[15px] text-foreground/80">
                <span className="marked">“{m.tension.quotes[0]}”</span>
              </p>
            )}
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky" style={{ top: "calc(24px + env(safe-area-inset-top, 0px))" }}>
            <Toc sections={sections.map((s) => ({ key: s.key, title: s.title, icon: SECTION_ICON[s.key] ?? "sparkles", count: count[s.key] ?? 0 }))} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          {sections.map((s) => (
            <section key={s.key} id={`sec-${s.key}`} style={{ scrollMarginTop: 24 }}>
              <Card className="p-6 sm:p-8">
                <header className="mb-6 flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
                    <CategoryIcon name={SECTION_ICON[s.key] ?? "sparkles"} className="size-5 text-secondary-foreground" />
                  </span>
                  <div>
                    <h2 className="text-2xl">{s.title}</h2>
                    <p className="text-pretty mt-1 text-sm text-muted-foreground">{s.description}</p>
                  </div>
                </header>
                <ReportBlocks blocks={s.blocks} ctx={{}} />
              </Card>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">Metoden: Gustavs modelleringskort, dybdeprofil og strategi-udledning. Citater, der ikke står ordret i personens egne replikker, er fjernet; fund uden belæg står med lav sikkerhed.</p>
        </div>
      </div>
    </div>
  );
}
