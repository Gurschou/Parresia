import type { Metadata } from "next";
import Link from "next/link";
import { Download, Fingerprint, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { buildModelingReport, MODELING_SECTIONS } from "@bm/core";
import { AutoRefresh } from "@/components/beliefs/match-actions";
import { PersonAvatar } from "@/components/beliefs/match-parts";
import { ModelBackfillButton, RerunModelButton } from "@/components/modeling/model-actions";
import { MODELING_SECTION_ICON, ModelGlance, PrecisionRing, SourceBadge } from "@/components/modeling/model-parts";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { CategoryIcon } from "@/components/report/category-icon";
import { ReportBlocks } from "@/components/report/report-blocks";
import { ReportToc } from "@/components/report/report-toc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getModelingView } from "@/server/modeling";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Modellering" };

export default async function ModelingPage({ searchParams }: { searchParams: Promise<{ person?: string; analysis?: string }> }) {
  const user = await requireUser();
  const { person, analysis } = await searchParams;
  const v = await getModelingView(user.id, person, analysis);
  const sel = v.selected;
  const map = v.map;
  const r = map?.result ?? null;
  const first = sel?.isSelf ? "dig" : (sel?.name.split(" ")[0] ?? "");

  const doc = r ? buildModelingReport(r) : null;
  const sections = doc?.sections.filter((s) => s.key !== "core") ?? [];
  const count = (key: string) => {
    if (!r) return 0;
    const m = r.map;
    return (
      ({
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
      } as Record<string, number>)[key] ?? 0
    );
  };

  return (
    <PageContainer>
      <AutoRefresh active={v.activeRuns > 0} doneMessage="Modelleringskortet er klar" />
      <PageHeader
        eyebrow="Gustavs modellering"
        title="Hvordan er personen skruet sammen?"
        description="Hver person modelleres ud fra alle sine samtaler: overbevisninger, mental syntaks og fysiologi oven på de seks behov, til en installationsplan. Hvert citat slås op ordret i transskripterne, og sikkerheden følger belægget."
        actions={
          sel && (
            <>
              {map && (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/analyses/${map.analysisId}/model/export?format=md`} download>
                      <Download /> Markdown
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/analyses/${map.analysisId}/model/export?format=pdf`} download>
                      <Download /> PDF
                    </a>
                  </Button>
                </>
              )}
              {!sel.active && (
                <RerunModelButton
                  analysisId={sel.latestAnalysisId}
                  fresh={!map}
                  variant={map ? "outline" : "default"}
                  label={map ? `Modellér ${first} igen` : `Modellér ${first}`}
                />
              )}
            </>
          )
        }
      />

      {(v.activeRuns > 0 || v.unmodeledAnalyses > 0) && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {v.activeRuns > 0 ? (
            <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
              <Loader2 className="size-4 animate-spin text-primary" />
              Modellerer {v.activeRuns === 1 ? "en person" : `${v.activeRuns} kørsler`} ud fra alle samtalerne lige nu …
            </p>
          ) : v.persons.some((p) => !p.latestMap) ? (
            <>
              <p className="text-sm">
                <span className="font-semibold">
                  {v.persons.filter((p) => !p.latestMap).length} {v.persons.filter((p) => !p.latestMap).length === 1 ? "person har" : "personer har"} intet modelleringskort endnu.
                </span>{" "}
                <span className="text-muted-foreground">Deres analyser er fra før modelleringen fandtes, eller kørslen blev afbrudt.</span>
              </p>
              <ModelBackfillButton count={v.persons.filter((p) => !p.latestMap).length} />
            </>
          ) : null}
        </Card>
      )}

      {v.persons.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="Ingen personer at modellere endnu"
          description="Analysér et transskript, så bygges personens modelleringskort automatisk bagefter."
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
          <nav aria-label="Vælg person" className="-mx-1 flex flex-wrap gap-2">
            {v.persons.map((p) => {
              const active = p.key === sel?.key;
              return (
                <Link
                  key={p.key}
                  href={`/modeling?person=${encodeURIComponent(p.key)}`}
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
                      {p.active ? "modelleres …" : p.latestMap ? `${p.latestMap.sessionCount} ${p.latestMap.sessionCount === 1 ? "samtale" : "samtaler"} · ${p.latestMap.precision} % belagt` : "ikke modelleret"}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {sel && !r && (
            <Card className="mt-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="flex items-start gap-4">
                <PersonAvatar name={sel.name} seed={sel.expertId ?? sel.key} className="size-12 rounded-xl text-base" />
                <div>
                  <h2 className="text-2xl">{sel.name}</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
                    {sel.active
                      ? `Kortet bygges nu ud fra ${sel.analysisIds.length} ${sel.analysisIds.length === 1 ? "samtale" : "samtaler"} …`
                      : `${sel.isSelf ? "Du er" : `${sel.name} er`} ikke modelleret endnu. Kortet bygges af ${sel.analysisIds.length === 1 ? "samtalen" : `alle ${sel.analysisIds.length} samtaler`}.`}
                  </p>
                </div>
              </div>
              {sel.active ? <Loader2 className="size-6 animate-spin text-primary" /> : <RerunModelButton analysisId={sel.latestAnalysisId} fresh variant="default" label={`Modellér ${first}`} />}
            </Card>
          )}

          {sel && r && map && doc && (
            <>
              {/* Hero: personen og kernen */}
              <section className="mt-10">
                <div className="flex flex-wrap items-center gap-4">
                  <PersonAvatar name={sel.name} seed={sel.expertId ?? sel.key} className="size-14 rounded-2xl text-lg" />
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-3xl">
                      {sel.name}
                      {sel.isSelf && <Badge tone="primary">Dig</Badge>}
                      <SourceBadge source={map.source} />
                    </h2>
                    <p className="text-muted-foreground">
                      Bygget af {r.sessions.length} {r.sessions.length === 1 ? "samtale" : "samtaler"} · {formatDate(map.updatedAt)}
                      {sel.role ? ` · ${sel.role}` : ""}
                    </p>
                  </div>
                </div>

                {r.map.core && (
                  <blockquote className="mt-8 max-w-4xl border-l-4 border-primary pl-5 font-display text-2xl font-semibold leading-snug tracking-[-0.01em] text-balance sm:text-[1.9rem]">
                    {r.map.core}
                  </blockquote>
                )}
                {r.map.result_modeled && (
                  <p className="mt-4 max-w-3xl text-muted-foreground text-pretty">
                    <span className="eyebrow mr-2 text-primary">Resultatet der modelleres</span>
                    {r.map.result_modeled}
                  </p>
                )}
                {map.note && (
                  <p className="mt-4 flex max-w-3xl items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-sm">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /> {map.note}
                  </p>
                )}
                <div className="mt-8">
                  <ModelGlance r={r} />
                </div>
                {r.map.tension.text && (
                  <div className="mt-3 rounded-xl border bg-muted/40 p-4">
                    <div className="eyebrow text-warning">Spændingen</div>
                    <p className="mt-1.5 leading-relaxed text-pretty">{r.map.tension.text}</p>
                    {r.map.tension.quotes[0] && (
                      <p className="said mt-2 text-[15px] text-foreground/80">
                        <span className="marked">“{r.map.tension.quotes[0]}”</span>
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Kortet */}
              <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="hidden lg:block">
                  <div className="sticky top-6 space-y-6">
                    <ReportToc sections={sections.map((s) => ({ key: s.key, title: s.title, icon: MODELING_SECTION_ICON[s.key] ?? "sparkles", count: count(s.key) }))} />
                    {v.history.length > 1 && (
                      <div>
                        <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Kortet over tid</div>
                        <ul className="space-y-0.5">
                          {v.history.map((h) => (
                            <li key={h.analysisId}>
                              <Link
                                href={`/modeling?analysis=${h.analysisId}`}
                                className={cn(
                                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                                  h.analysisId === map.analysisId && "bg-secondary font-semibold text-secondary-foreground",
                                )}
                              >
                                <PrecisionRing value={h.precision} size={22} className="[&>span]:hidden" />
                                {formatDate(h.updatedAt)}
                                <span className="ml-auto font-mono text-xs">{h.sessionCount}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </aside>
                <div className="min-w-0 space-y-6">
                  {sections.map((s) => (
                    <section key={s.key} id={s.key} className="scroll-mt-6">
                      <Card className="p-6 sm:p-8">
                        <header className="mb-6 flex items-start gap-4">
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
                            <CategoryIcon name={MODELING_SECTION_ICON[s.key] ?? "sparkles"} className="size-5 text-secondary-foreground" />
                          </span>
                          <div>
                            <h2 className="text-2xl">{s.title}</h2>
                            <p className="mt-1 text-sm text-muted-foreground text-pretty">{s.description}</p>
                          </div>
                        </header>
                        <ReportBlocks blocks={s.blocks} ctx={{ sectionKey: s.key, sectionTitle: s.title }} />
                      </Card>
                    </section>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Metoden: {MODELING_SECTIONS.length - 2} lag efter Gustavs modelleringskort, dybdeprofil og strategi-udledning. Citater, der ikke står ordret i personens egne replikker, er fjernet; fund uden belæg står med lav sikkerhed.
                    {map.model ? ` Model: ${map.model}.` : ""}
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
