import * as React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Columns3,
  FileText,
  FileUp,
  Library,
  Link2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users,
  Workflow,
} from "lucide-react";
import {
  CONVINCER_CHANNEL_LABEL,
  CONVINCER_MODE_LABEL,
  DEMO_TRANSCRIPTS,
  HUMAN_NEEDS,
  HUMAN_NEED_LABEL,
  REP_SYSTEMS,
  REP_SYSTEM_LABEL,
  SAMPLE_TRANSCRIPT,
  STRATEGY_TYPE_LABEL,
  TEXT_EXTENSIONS,
  aggregateDashboard,
  cn,
  colorSlot,
  compareAnalyses,
  countVakogPredicates,
  formatDate,
  formatNumber,
  getCategory,
  initials,
  isTextTranscriptFile,
  normalizeTranscriptFile,
  relativeTime,
  slug,
  suggestPatterns,
  uid,
  type AnalysisRecord,
} from "./lib";
import { Badge, Button, Card, EmptyState, Field, LinkButton, PageHeader, inputClass } from "./ui";
import { BeliefsOverTime, DistributionBar, HBarList, MetaProgramScale, NeedsRadar, VakogLegend } from "./charts";
import { CategoryIcon, Quote } from "./report";
import { MAX_TRANSCRIPT_CHARS, analyzeDemo, analyzeWithClaude, sampleErrorMessage, type AnalyzeProgress } from "./analyze";
import type { AppCtx } from "./app-ctx";
import type { StoredAnalysis } from "./store";

const toRecord = (a: StoredAnalysis): AnalysisRecord => ({
  id: a.id,
  title: a.title,
  createdAt: a.createdAt,
  sessionDate: a.sessionDate,
  expertId: slug(a.expertName),
  expertName: a.expertName,
  result: a.result,
});

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("gutter mx-auto w-full max-w-7xl py-8 lg:py-10", className)}>{children}</div>;
}

function ExampleBadge() {
  return <Badge tone="warning">Eksempel</Badge>;
}

/* ─────────────────────────────── Oversigt ─────────────────────────────── */

type Strategy = StoredAnalysis["result"]["cognitive_strategies"]["strategies"][number];

/** Strategi-trin i NLP-notation: system + orientering (e/i) + tid (r/c). */
export function StepCode({ step }: { step: Strategy["steps"][number] }) {
  const o = step.orientation === "internal" ? "i" : "e";
  const t = step.temporal === "remembered" ? "r" : step.temporal === "constructed" ? "c" : "";
  return (
    <span className="font-mono text-[13px] leading-none font-semibold whitespace-nowrap">
      {step.system}
      <span className="relative top-[0.3em] ml-px text-[10px] font-medium opacity-75">{o}</span>
      {t && <span className="relative -top-[0.45em] text-[10px] font-medium opacity-75">{t}</span>}
    </span>
  );
}

const REP_SLOT: Record<string, number> = { V: 1, A: 2, K: 3, O: 4, G: 5, Ad: 6 };

export function StepChain({ steps }: { steps: Strategy["steps"] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Strategiens trin">
      {steps.map((st, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span
            className="tip inline-flex h-8 items-center rounded-md border bg-background px-2.5"
            tabIndex={0}
            data-tip={st.description.slice(0, 60)}
            style={{ boxShadow: `inset 0 -3px 0 var(--series-${REP_SLOT[st.system] ?? 1})` }}
          >
            <StepCode step={st} />
          </span>
          <span className="text-muted-foreground" aria-hidden>
            →
          </span>
        </li>
      ))}
      <li className="inline-flex h-8 items-center rounded-md bg-foreground px-2.5 font-mono text-[12px] font-semibold text-background">Exit</li>
    </ol>
  );
}

function trimQuote(q: string, max = 190): string {
  const t = q.trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(" ", max)) + " …";
}

/** Et rigtigt fund fra den nyeste analyse: ordret citat → udledt strategi. */
function Specimen({ analyses }: { analyses: StoredAnalysis[] }) {
  let pick: { a: StoredAnalysis; s: Strategy; quote: string } | null = null;
  for (const a of analyses) {
    for (const st of a.result.cognitive_strategies.strategies) {
      const quote = st.quotes.find((q) => q.trim().length > 40) ?? st.steps.find((x) => x.quote.trim().length > 40)?.quote;
      if (quote && st.steps.length >= 3) {
        pick = { a, s: st, quote };
        break;
      }
    }
    if (pick) break;
  }
  if (!pick) return null;
  const { a, s, quote } = pick;
  return (
    <a href={`#analyse-${a.id}`} className="card group block min-w-0 p-6 transition hover:-translate-y-0.5 sm:p-7">
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="eyebrow">Sagt i interviewet</span>
        <span className="truncate text-xs">
          {a.expertName} · {formatDate(a.sessionDate, { day: "numeric", month: "short" })}
        </span>
      </div>
      <p className="said text-pretty mt-4 text-[19px] leading-[1.6] sm:text-[21px]">
        <span className="marked">“{trimQuote(quote)}”</span>
      </p>
      <div className="my-6 flex items-center gap-3 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="eyebrow">Udledt strategi</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <StepChain steps={s.steps} />
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-pretty font-semibold leading-snug">{s.name}</div>
          <div className="text-pretty mt-1 text-sm text-muted-foreground">{s.context}</div>
        </div>
        <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
      </div>
    </a>
  );
}

export function Overview({ ctx }: { ctx: AppCtx }) {
  const { analyses, own, patterns } = ctx.store;
  const records = analyses.map(toRecord);
  const dash = aggregateDashboard(records);
  const suggestions = suggestPatterns(records);
  const primary = [...REP_SYSTEMS].sort((x, y) => dash.vakogAverage[y] - dash.vakogAverage[x])[0]!;
  return (
    <div>
      <section className="border-b">
        <div className="gutter mx-auto grid max-w-7xl items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-16">
          <div className="min-w-0">
            <div className="eyebrow text-primary">Advanced Behavioral Modeling</div>
            <h1 className="mt-4 text-[2.6rem] leading-[0.98] sm:text-6xl">
              Fra det, de siger,
              <br />
              til det, de gør.
            </h1>
            <p className="text-pretty mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              Indsæt et interview med en, der mestrer noget. Claude udtrækker strategier, overbevisninger, værdier, meta-programmer og VAKOG, og hvert fund peger tilbage på et ordret citat.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="#ny-analyse" size="lg">
                <Sparkles /> Ny analyse
              </LinkButton>
              <LinkButton href="#dashboard" size="lg" variant="outline">
                Se mønstrene <ArrowRight />
              </LinkButton>
            </div>
            {own.length === 0 && <p className="mt-5 text-sm text-muted-foreground">Fire eksempel-analyser er lagt ind, så du kan se resultatet før din første analyse.</p>}
          </div>
          <Specimen analyses={analyses} />
        </div>
      </section>
      <Container>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {[
            { label: "Analyser", value: analyses.length, href: "#analyser" },
            { label: "Eksperter", value: dash.totals.experts, href: "#eksperter" },
            { label: "Strategier fundet", value: dash.totals.strategies, href: "#dashboard" },
            { label: "Mønstre i biblioteket", value: patterns.length, href: "#moenstre" },
          ].map((k) => (
            <a key={k.label} href={k.href} className="group flex items-end justify-between gap-3 bg-card px-5 py-4 transition hover:bg-muted/60">
              <div className="min-w-0">
                <dt className="truncate text-[13px] text-muted-foreground">{k.label}</dt>
                <dd className="tabular mt-1 text-3xl font-bold tracking-[-0.03em]">{k.value}</dd>
              </div>
              <ArrowUpRight className="mb-1 size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </a>
          ))}
        </dl>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl">Seneste analyser</h2>
              <a href="#analyser" className="text-sm font-semibold text-primary hover:underline">
                Alle analyser
              </a>
            </div>
            <ul className="card divide-y overflow-hidden">
              {analyses.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <a href={`#analyse-${a.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-muted/60 sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: `var(--series-${colorSlot(a.expertName)})` }}>
                      {initials(a.expertName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{a.title}</div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {a.expertName} · {relativeTime(a.createdAt)}
                      </div>
                    </div>
                    {a.example ? <ExampleBadge /> : <Badge tone="positive">{a.meta.provider === "claude" ? "Claude" : "Demo"}</Badge>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex min-w-0 flex-col gap-8">
            <section>
              <h2 className="mb-3 text-xl">Samlet VAKOG-profil</h2>
              <div className="card p-5">
                <div className="mb-3 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Gennemsnit af {analyses.length} analyser</span>
                  <span className="font-semibold">{REP_SYSTEM_LABEL[primary]}</span>
                </div>
                <DistributionBar distribution={dash.vakogAverage} highlight={primary} />
                <VakogLegend distribution={dash.vakogAverage} primary={primary} />
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xl">Fælles mønstre</h2>
                <a href="#moenstre" className="text-sm font-semibold text-primary hover:underline">
                  Alle mønstre
                </a>
              </div>
              <ul className="flex flex-col gap-2">
                {suggestions.slice(0, 4).map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
                    <span className="min-w-0 text-sm leading-snug font-semibold">{s.title}</span>
                    <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">{s.expertCount} eksp.</span>
                  </li>
                ))}
                {suggestions.length === 0 && <li className="text-sm text-muted-foreground">Analysér mindst to eksperter for at se fælles mønstre.</li>}
              </ul>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}

/* ─────────────────────────────── Ny analyse ─────────────────────────────── */

export function NewAnalysis({ ctx }: { ctx: AppCtx }) {
  const [transcript, setTranscript] = React.useState("");
  const [expert, setExpert] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [interviewer, setInterviewer] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [sessionDate, setSessionDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [tier, setTier] = React.useState<"complex" | "default">("complex");
  const [running, setRunning] = React.useState<null | { mode: "claude" | "demo"; progress: AnalyzeProgress; started: number }>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const ctl = React.useRef<AbortController | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const experts = Array.from(new Set(ctx.store.analyses.map((a) => a.expertName))).sort((a, b) => a.localeCompare(b, "da"));

  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - running.started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const tooShort = transcript.trim().length < 80;
  const tooLong = transcript.length > MAX_TRANSCRIPT_CHARS;

  function useExample(i: number) {
    const d = DEMO_TRANSCRIPTS[i]!;
    setTranscript(d.transcript);
    setExpert(d.expert);
    setDomain(d.role);
    setTitle(`${d.title} (ny analyse)`);
  }

  async function onFile(f: File) {
    if (!isTextTranscriptFile(f.name)) {
      ctx.toast(`Brug en tekstfil: ${TEXT_EXTENSIONS.join(", ")}`, "negative");
      return;
    }
    setTranscript(normalizeTranscriptFile(f.name, await f.text()));
    ctx.toast(`Indlæste ${f.name}`, "positive");
  }

  async function run(mode: "claude" | "demo") {
    if (tooShort || tooLong || running) return;
    setError(null);
    const controller = new AbortController();
    ctl.current = controller;
    const started = Date.now();
    setElapsed(0);
    setRunning({ mode, progress: { stage: "waiting", chars: 0 }, started });
    const context = { subjectName: expert.trim() || undefined, domain: domain.trim() || undefined, goal: goal.trim() || undefined, interviewer: interviewer.trim() || undefined };
    const onProgress = (p: AnalyzeProgress) => setRunning((r) => (r ? { ...r, progress: p } : r));
    try {
      const out =
        mode === "claude" && ctx.sample
          ? await analyzeWithClaude(ctx.sample, { transcript, context }, { modelTier: tier, signal: controller.signal, onProgress })
          : await analyzeDemo({ transcript, context }, onProgress);
      const id = uid();
      const subject = out.result.summary.subject;
      const record: StoredAnalysis = {
        id,
        title: title.trim() || `${expert.trim() || subject} · ${formatDate(sessionDate)}`,
        expertName: expert.trim() || (subject && subject !== "Ukendt person" ? subject : "Ukendt person"),
        domain: domain.trim(),
        goal: goal.trim(),
        sessionDate,
        createdAt: new Date().toISOString(),
        transcript,
        result: out.result,
        meta: { provider: mode === "claude" ? "claude" : "demo", modelTier: out.modelTier, durationMs: Date.now() - started, repaired: out.repaired, fixes: out.fixes, lexicon: countVakogPredicates(transcript) },
      };
      await ctx.store.saveAnalysis(record);
      ctx.toast("Analysen er færdig", "positive");
      location.hash = `analyse-${id}`;
    } catch (e) {
      if ((e as { code?: string })?.code !== "cancelled") setError(sampleErrorMessage(e));
    } finally {
      setRunning(null);
    }
  }

  const stageText = running
    ? running.progress.stage === "waiting"
      ? running.mode === "claude"
        ? "Claude læser transskriptet og tænker…"
        : "Forbereder demo-analysen…"
      : running.progress.stage === "writing"
        ? `Skriver den strukturerede model · ${formatNumber(running.progress.chars)} tegn`
        : running.progress.stage === "validating"
          ? "Validerer mod analyse-schemaet"
          : "Retter valideringsfejl (én reparationsrunde)"
    : "";

  return (
    <Container>
      <PageHeader
        eyebrow="Ny analyse"
        title="Hvem vil du modellere i dag?"
        description="Indsæt et transskript eller indlæs en tekstfil. Claude laver hele adfærdsmodellen; analysen gemmes privat for dig."
      />
      {running ? (
        <Card className="relative mx-auto max-w-3xl overflow-hidden p-8 sm:p-10">
          <div className="shimmer absolute inset-x-0 top-0 h-1" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{running.mode === "claude" ? "Claude analyserer" : "Demo-analyse"}</div>
              <h2 className="mt-1 text-2xl">{stageText}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {running.mode === "claude" ? "En grundig analyse tager typisk 1-3 minutter: Claude tænker først og skriver derefter." : "Uden Claude: en simpel model bygget af transskriptet."} (
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")})
              </p>
            </div>
            <Loader2 className="size-8 shrink-0 animate-spin text-primary" />
          </div>
          <ol className="mt-8 grid grid-cols-3 gap-3 text-center text-xs font-semibold">
            {[
              ["waiting", "Læser og tænker"],
              ["writing", "Skriver modellen"],
              ["validating", "Validerer"],
            ].map(([k, label], i) => {
              const order = ["waiting", "writing", "validating", "repairing"];
              const cur = order.indexOf(running.progress.stage);
              const done = i < cur;
              const active = i === Math.min(cur, 2);
              return (
                <li key={k} className="flex flex-col items-center gap-2">
                  <span
                    className={cn("flex size-10 items-center justify-center rounded-2xl border", done && "border-transparent bg-primary text-primary-foreground", active && "border-[var(--primary)] bg-secondary text-primary")}
                  >
                    {done ? <Check className="size-5" /> : i + 1}
                  </span>
                  <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                </li>
              );
            })}
          </ol>
          {running.mode === "claude" && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={() => ctl.current?.abort()}>
                <Square /> Stop
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="self-start overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3">
              <span className="text-sm font-semibold">Transskript</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
                  <FileUp /> Indlæs fil
                </Button>
                <Button size="sm" variant="ghost" onClick={() => useExample(0)}>
                  <Sparkles className="text-primary" /> Brug eksempel
                </Button>
              </div>
              <input ref={fileInput} id="file" type="file" accept={TEXT_EXTENSIONS.join(",")} hidden onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
            </div>
            <div className="p-5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), e.dataTransfer.files[0] && void onFile(e.dataTransfer.files[0]))}>
              <textarea
                id="transcript"
                aria-label="Transskript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={"Indsæt interviewet her, eller træk en tekstfil hertil.\n\nInterviewer: Hvad gør du, når …\nEkspert: Det første jeg gør, er …"}
                className={cn(inputClass, "min-h-[380px] resize-y font-mono text-[13px] leading-6")}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
              <span>
                {formatNumber(words)} ord · {formatNumber(transcript.length)} tegn
              </span>
              <span>{tooLong ? `For langt: højst ${formatNumber(MAX_TRANSCRIPT_CHARS)} tegn` : transcript && tooShort ? "Mindst 80 tegn" : "Talerlinjer som “Navn: …” giver den bedste analyse"}</span>
            </div>
          </Card>
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="font-sans text-sm font-bold tracking-wider text-muted-foreground uppercase">Model & kontekst</h2>
              <Field label="Person der modelleres" htmlFor="expert">
                <input id="expert" list="experts" className={inputClass} value={expert} onChange={(e) => setExpert(e.target.value)} placeholder="Fx Mette Holm" />
                <datalist id="experts">
                  {experts.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </Field>
              <Field label="Rolle / domæne" htmlFor="domain">
                <input id="domain" className={inputClass} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Fx salgsdirektør" />
              </Field>
              <Field label="Resultat der modelleres" htmlFor="goal">
                <textarea id="goal" className={cn(inputClass, "min-h-16")} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Fx lukker store B2B-aftaler konsekvent" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sessionsdato" htmlFor="date">
                  <input id="date" type="date" className={inputClass} value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
                </Field>
                <Field label="Interviewer" htmlFor="interviewer">
                  <input id="interviewer" className={inputClass} value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Navn" />
                </Field>
              </div>
              <Field label="Titel" htmlFor="title">
                <input id="title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Valgfri" />
              </Field>
              {ctx.sample && (
                <Field label="Analysedybde" htmlFor="tier">
                  <select id="tier" className={inputClass} value={tier} onChange={(e) => setTier(e.target.value as "complex" | "default")}>
                    <option value="complex">Grundig — mest kapable model (1-3 min)</option>
                    <option value="default">Hurtigere — standardmodel</option>
                  </select>
                </Field>
              )}
            </Card>
            {error && (
              <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--negative-soft)" }}>
                {error}
              </div>
            )}
            {ctx.sample ? (
              <Button size="lg" className="w-full" disabled={tooShort || tooLong} onClick={() => void run("claude")}>
                <Sparkles /> Analysér med Claude <ArrowRight className="ml-auto" />
              </Button>
            ) : (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                {ctx.capsReady ? "Claude er ikke tilgængelig i denne visning. Åbn siden i claude.ai for at køre en rigtig analyse." : "Forbinder til Claude…"}
              </p>
            )}
            <Button variant="outline" className="w-full" disabled={tooShort || tooLong} onClick={() => void run("demo")}>
              Kør demo-analyse uden Claude
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Analysen bruger platformens system-prompt ordret og valideres mod samme schema som web-appen og CLI'en. Den kører på din egen Claude-konto; første gang bliver du spurgt om lov.
            </p>
          </div>
        </div>
      )}
    </Container>
  );
}

/* ─────────────────────────────── Analyser ─────────────────────────────── */

export function AnalysesList({ ctx, selected, setSelected }: { ctx: AppCtx; selected: string[]; setSelected: (ids: string[]) => void }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= 4 ? selected : [...selected, id]);
  return (
    <Container>
      <PageHeader
        eyebrow="Historik"
        title="Analyser"
        description="Dine egne analyser og de fire eksempler. Vælg 2-4 for at sammenligne dem side om side."
        actions={
          <>
            <Button variant="outline" disabled={selected.length < 2} onClick={() => (location.hash = "sammenlign")}>
              <Columns3 /> Sammenlign {selected.length >= 2 ? `(${selected.length})` : ""}
            </Button>
            <LinkButton href="#ny-analyse">
              <Sparkles /> Ny analyse
            </LinkButton>
          </>
        }
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">Analyse</th>
              <th className="px-3 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ekspert</th>
              <th className="hidden px-3 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:table-cell">Dato</th>
              <th className="px-3 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">Kilde</th>
            </tr>
          </thead>
          <tbody>
            {ctx.store.analyses.map((a) => (
              <tr key={a.id} className={cn("border-b last:border-0 hover:bg-muted/50", selected.includes(a.id) && "bg-secondary/50")}>
                <td className="px-3 py-3">
                  <input type="checkbox" id={`sel-${a.id}`} aria-label={`Vælg ${a.title}`} checked={selected.includes(a.id)} onChange={() => toggle(a.id)} className="size-4 cursor-pointer accent-[var(--primary)]" />
                </td>
                <td className="px-3 py-3">
                  <a href={`#analyse-${a.id}`} className="font-semibold hover:text-primary">
                    {a.title}
                  </a>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{a.expertName}</td>
                <td className="hidden px-3 py-3 whitespace-nowrap text-muted-foreground sm:table-cell">{formatDate(a.sessionDate || a.createdAt)}</td>
                <td className="px-3 py-3">{a.example ? <ExampleBadge /> : <Badge tone={a.meta.provider === "claude" ? "positive" : "neutral"}>{a.meta.provider === "claude" ? "Claude" : "Demo"}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Container>
  );
}

/* ─────────────────────────────── Eksperter ─────────────────────────────── */

export function Experts({ ctx }: { ctx: AppCtx }) {
  const groups = new Map<string, StoredAnalysis[]>();
  for (const a of ctx.store.analyses) groups.set(a.expertName, [...(groups.get(a.expertName) ?? []), a]);
  return (
    <Container>
      <PageHeader eyebrow="Modeller" title="Eksperter" description="Hver ekspert samler analyser på tværs af sessioner til én profil." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...groups.entries()].map(([name, list]) => (
          <a key={name} href={`#ekspert-${slug(name)}`} className="group">
            <Card className="h-full p-5 transition group-hover:-translate-y-0.5">
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white" style={{ background: `var(--series-${colorSlot(name)})` }}>
                  {initials(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-bold tracking-[-0.01em]">{name}</div>
                  <div className="truncate text-sm text-muted-foreground">{list[0]!.domain || "Ingen rolle angivet"}</div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{list.length}</span> {list.length === 1 ? "analyse" : "analyser"}
                </span>
                <span>Senest {relativeTime(list[0]!.createdAt)}</span>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </Container>
  );
}

export function ExpertProfile({ ctx, expertSlug, setSelected }: { ctx: AppCtx; expertSlug: string; setSelected: (ids: string[]) => void }) {
  const list = ctx.store.analyses.filter((a) => slug(a.expertName) === expertSlug);
  if (!list.length) return <Container><EmptyState icon={Users} title="Eksperten findes ikke" action={<LinkButton href="#eksperter">Til eksperter</LinkButton>} /></Container>;
  const name = list[0]!.expertName;
  const dash = aggregateDashboard(list.map(toRecord));
  const primary = [...REP_SYSTEMS].sort((a, b) => dash.vakogAverage[b] - dash.vakogAverage[a])[0]!;
  const strategies = list.flatMap((a) => a.result.cognitive_strategies.strategies.map((s) => ({ ...s, analysisId: a.id })));
  return (
    <div>
      <section className="relative overflow-hidden border-b">
        <div className="gutter relative mx-auto flex max-w-7xl flex-col gap-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-5">
            <span className="flex size-20 shrink-0 items-center justify-center rounded-3xl text-2xl font-bold text-white shadow-lg" style={{ background: `var(--series-${colorSlot(name)})` }}>
              {initials(name)}
            </span>
            <div className="min-w-0">
              <h1 className="text-4xl sm:text-5xl">{name}</h1>
              <p className="mt-1 text-lg text-muted-foreground">
                {list[0]!.domain || "Ingen rolle angivet"} · {list.length} {list.length === 1 ? "session" : "sessioner"}
              </p>
            </div>
          </div>
          {list.length >= 2 && (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(list.slice(0, 4).map((a) => a.id));
                location.hash = "sammenlign";
              }}
            >
              <Columns3 /> Sammenlign sessioner
            </Button>
          )}
        </div>
      </section>
      <Container>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">VAKOG (gennemsnit)</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Primært: {REP_SYSTEM_LABEL[primary]}</p>
            <div className="mt-4">
              <DistributionBar distribution={dash.vakogAverage} highlight={primary} />
              <VakogLegend distribution={dash.vakogAverage} primary={primary} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">6 Human Needs (gennemsnit)</h3>
            <NeedsRadar axes={HUMAN_NEEDS.map((n) => HUMAN_NEED_LABEL[n])} series={[{ name: "Gennemsnit", color: "var(--series-1)", values: HUMAN_NEEDS.map((n) => dash.needsAverage[n]) }]} size={220} />
          </Card>
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">Meta-programmer (tendens)</h3>
            <div className="mt-2 divide-y">
              {dash.metaPrograms.slice(0, 6).map((m) => (
                <MetaProgramScale key={m.program} name={m.name} poles={m.poles} leaning={Math.abs(m.tendency) < 10 ? "balanced" : m.tendency < 0 ? "pole_a" : "pole_b"} strength={Math.abs(m.tendency)} />
              ))}
            </div>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">Strategier på tværs af sessioner</h3>
            <ul className="mt-3 divide-y">
              {strategies.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <a href={`#analyse-${s.analysisId}`} className="font-semibold hover:text-primary">
                      {s.name}
                    </a>
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
                <Badge key={v.value} tone={v.direction === "toward" ? "positive" : "negative"}>
                  {v.value}
                  {v.count > 1 && <span className="opacity-70">×{v.count}</span>}
                </Badge>
              ))}
            </div>
            <h3 className="mt-6 font-sans text-sm font-bold">Sessioner</h3>
            <ul className="mt-2 divide-y text-sm">
              {list.map((a) => (
                <li key={a.id}>
                  <a href={`#analyse-${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                    <span className="w-24 shrink-0 text-muted-foreground">{formatDate(a.sessionDate)}</span>
                    <span className="truncate font-medium">{a.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Container>
    </div>
  );
}

/* ─────────────────────────────── Sammenlign ─────────────────────────────── */

const COL = (i: number) => `var(--series-${i + 1})`;

export function Compare({ ctx, selected, setSelected }: { ctx: AppCtx; selected: string[]; setSelected: (ids: string[]) => void }) {
  const records = selected.map((id) => ctx.store.analyses.find((a) => a.id === id)).filter((a): a is StoredAnalysis => !!a);
  const picker = (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ctx.store.analyses.map((a) => {
        const on = selected.includes(a.id);
        return (
          <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition", on && "bg-secondary/50")} style={on ? { borderColor: "color-mix(in oklch, var(--primary) 45%, transparent)" } : undefined}>
            <input
              type="checkbox"
              id={`cmp-${a.id}`}
              className="mt-1 size-4 accent-[var(--primary)]"
              checked={on}
              onChange={() => setSelected(on ? selected.filter((x) => x !== a.id) : selected.length >= 4 ? selected : [...selected, a.id])}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{a.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.expertName} · {formatDate(a.sessionDate)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
  if (records.length < 2) {
    return (
      <Container>
        <PageHeader eyebrow="Sammenlign" title="Sammenlign modeller" description="Vælg 2-4 analyser: VAKOG, behov, meta-programmer, værdier, overbevisninger og strategier side om side." />
        <Card className="p-6">{picker}</Card>
      </Container>
    );
  }
  const c = compareAnalyses(records.map(toRecord));
  const shared = c.values.filter((v) => v.shared).length;
  const agree = c.metaPrograms.filter((m) => m.agreement).length;
  return (
    <Container>
      <PageHeader eyebrow="Sammenlign" title="Side om side" description={`${c.columns.length} analyser · ${shared} fælles værdier · ${agree} meta-programmer med samme retning`} />
      <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${c.columns.length}, minmax(0,1fr))` }}>
        {c.columns.map((col, i) => (
          <a key={col.id} href={`#analyse-${col.id}`} className="min-w-0 rounded-2xl border bg-card p-4 hover:shadow-sm">
            <div className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ background: COL(i) }} />
              <span className="truncate text-xs font-semibold tracking-wider text-muted-foreground uppercase">{col.expert}</span>
            </div>
            <div className="mt-1.5 line-clamp-2 text-[17px] leading-snug font-bold tracking-[-0.01em]">{col.title}</div>
          </a>
        ))}
      </div>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-xl">VAKOG</h2>
            <div className="mt-5 flex flex-col gap-4">
              {c.columns.map((col, i) => (
                <div key={col.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: COL(i) }} /> <span className="truncate">{col.expert}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">Primært: {REP_SYSTEM_LABEL[c.primarySystems[i]!]}</span>
                  </div>
                  <DistributionBar distribution={Object.fromEntries(c.vakog.map((v) => [v.system, v.values[i]!]))} highlight={c.primarySystems[i]} />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl">6 Human Needs</h2>
            <NeedsRadar axes={c.needs.map((n) => HUMAN_NEED_LABEL[n.need])} series={c.columns.map((col, i) => ({ name: col.expert, color: COL(i), values: c.needs.map((n) => n.values[i]!) }))} size={250} />
            <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
              {c.columns.map((col, i) => (
                <span key={col.id} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ background: COL(i) }} /> {col.expert}: <span className="text-muted-foreground">{c.dominantNeeds[i]!.map((n) => HUMAN_NEED_LABEL[n]).join(" & ")}</span>
                </span>
              ))}
            </div>
          </Card>
        </div>
        <Card className="p-6">
          <h2 className="text-xl">Meta-programmer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Samme retning i alle analyser med programmet er markeret som fælles.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">Program</th>
                  {c.columns.map((col, i) => (
                    <th key={col.id} className="px-3 py-2 text-left text-xs font-bold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                      <span className="inline-block size-2 rounded-full align-middle" style={{ background: COL(i) }} /> {col.expert}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.metaPrograms.map((m) => (
                  <tr key={m.program} className="border-b last:border-0" style={m.agreement ? { background: "color-mix(in oklch, var(--positive-soft) 45%, transparent)" } : undefined}>
                    <td className="py-2.5 pr-4 font-medium">
                      <span className="flex flex-wrap items-center gap-2">
                        {m.name}
                        {m.agreement && (
                          <Badge tone="positive">
                            <Link2 /> Fælles
                          </Badge>
                        )}
                      </span>
                    </td>
                    {m.cells.map((cell, i) => (
                      <td key={i} className="px-3 py-2.5">
                        {cell ? (
                          <>
                            {cell.label} <span className="tabular text-xs text-muted-foreground">{Math.round(cell.strength)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 pr-4 font-medium">Convincer</td>
                  {c.convincer.map((cv, i) => (
                    <td key={i} className="px-3 py-2.5">
                      {CONVINCER_CHANNEL_LABEL[cv.channel as keyof typeof CONVINCER_CHANNEL_LABEL]} · {CONVINCER_MODE_LABEL[cv.mode as keyof typeof CONVINCER_MODE_LABEL]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-xl">Værdier</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {c.values.slice(0, 20).map((v) => (
                    <tr key={v.key} className={cn("border-b last:border-0", v.shared && "font-semibold")}>
                      <td className="py-2 pr-3">{v.value}</td>
                      {v.present.map((p, i) => (
                        <td key={i} className="w-12 py-2 text-center">
                          {p ? <Check className="mx-auto size-4" style={{ color: COL(i) }} /> : <span className="text-muted-foreground">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl">Strategier</h2>
            <div className="mt-4 flex flex-col gap-4">
              {c.strategies.map((list, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: COL(i) }} /> {c.columns[i]!.expert}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {list.map((s, j) => (
                      <li key={j} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          {s.name} <span className="text-xs text-muted-foreground">· {STRATEGY_TYPE_LABEL[s.type as keyof typeof STRATEGY_TYPE_LABEL] ?? s.type}</span>
                        </span>
                        <code className="font-mono text-xs">{s.notation}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card className="p-6">
          <h2 className="text-xl">Overbevisninger</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {c.columns.map((col, i) => (
              <div key={col.id} className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: COL(i) }} /> {col.expert}
                </div>
                {c.beliefs
                  .filter((b) => b.column === i)
                  .map((b, j) => (
                    <div key={j} className="rounded-lg border p-2.5 text-sm">
                      <div className="text-pretty">{b.statement}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone={b.kind === "enabling" ? "positive" : "negative"}>{b.kind === "enabling" ? "Styrkende" : "Begrænsende"}</Badge>
                        {b.sharedWith.length > 0 && (
                          <Badge tone="info">
                            <Link2 /> deles med {b.sharedWith.map((k) => c.columns[k]!.expert).join(", ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Card>
        <details className="rounded-2xl border bg-card p-6">
          <summary className="cursor-pointer font-semibold">Skift udvalg</summary>
          <div className="mt-4">{picker}</div>
        </details>
      </div>
    </Container>
  );
}

/* ─────────────────────────────── Mønstre ─────────────────────────────── */

export function Patterns({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = React.useState<"forslag" | "bibliotek">(ctx.store.patterns.length ? "bibliotek" : "forslag");
  const suggestions = suggestPatterns(ctx.store.analyses.map(toRecord));
  const savedTitles = new Set(ctx.store.patterns.map((p) => p.title));
  return (
    <Container>
      <PageHeader eyebrow="Mønsterbibliotek" title="Fælles mønstre på tværs af eksperter" description="Gem fund fra rapporterne (bogmærke-ikonet), eller gem de mønstre, platformen selv finder hos flere eksperter." />
      <div className="mb-6 inline-flex h-11 items-center gap-1 rounded-xl bg-muted p-1" role="tablist">
        {(
          [
            ["bibliotek", `Bibliotek (${ctx.store.patterns.length})`, Library],
            ["forslag", `Automatiske forslag (${suggestions.length})`, Sparkles],
          ] as const
        ).map(([k, label, I]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-muted-foreground transition", tab === k && "bg-card text-foreground shadow-sm")}>
            <I className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "bibliotek" ? (
        ctx.store.patterns.length === 0 ? (
          <EmptyState icon={Library} title="Biblioteket er tomt" description="Klik på bogmærket ved et fund i en rapport, eller gem et automatisk forslag." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ctx.store.patterns.map((p) => {
              const cat = getCategory(p.category);
              const experts = new Set(p.examples.map((e) => e.expertName)).size;
              return (
                <Card key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      <CategoryIcon name={cat?.icon ?? "sparkles"} className="size-5 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{cat?.title}</div>
                      <h3 className="mt-0.5 text-[17px] leading-snug font-bold tracking-[-0.01em]">{p.title}</h3>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Slet mønster" onClick={() => void ctx.store.deletePattern(p.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                  {p.description && <p className="text-pretty mt-3 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="primary">
                      <Users /> {experts} {experts === 1 ? "ekspert" : "eksperter"}
                    </Badge>
                    {p.tags.map((t) => (
                      <Badge key={t} tone="outline">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                  <ul className="mt-4 flex flex-col gap-2 border-t pt-4">
                    {p.examples.map((ex, i) => (
                      <li key={i} className="rounded-lg bg-muted/50 p-3 text-sm">
                        <div className="text-pretty font-medium">{ex.label}</div>
                        <a href={`#analyse-${ex.analysisId}`} className="text-xs text-muted-foreground hover:text-primary">
                          {ex.expertName} · {ex.analysisTitle}
                        </a>
                        {ex.quotes?.[0] && <Quote text={ex.quotes[0]} className="mt-2 text-[13px]" />}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )
      ) : suggestions.length === 0 ? (
        <EmptyState icon={Sparkles} title="Ingen fælles mønstre endnu" description="Forslag vises, når mindst to eksperter deler en strategi-sekvens, et meta-program, en værdi, et behov eller en beslægtet overbevisning." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {suggestions.map((s) => {
            const cat = getCategory(s.category);
            const saved = savedTitles.has(s.title.slice(0, 200));
            return (
              <Card key={s.key} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <CategoryIcon name={cat?.icon ?? "sparkles"} className="size-5 text-accent-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{cat?.title}</div>
                    <h3 className="mt-0.5 text-[17px] leading-snug font-bold tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <Badge tone="primary">
                    <Users /> {s.expertCount} eksperter · {s.occurrences.length} forekomster
                  </Badge>
                  <Button
                    size="sm"
                    variant={saved ? "secondary" : "outline"}
                    disabled={saved}
                    onClick={async () => {
                      await ctx.store
                        .savePattern({
                          id: uid(),
                          title: s.title.slice(0, 200),
                          category: s.category,
                          description: s.description,
                          tags: ["auto"],
                          examples: s.occurrences.map((o) => ({ analysisId: o.analysisId, analysisTitle: o.analysisTitle, expertName: o.expert, label: o.label, quotes: o.quote ? [o.quote] : [] })),
                          createdAt: new Date().toISOString(),
                        })
                        .then(() => ctx.toast("Mønstret er gemt i biblioteket", "positive"))
                        .catch(() => ctx.toast("Kunne ikke gemme mønstret.", "negative"));
                    }}
                  >
                    {saved ? (
                      <>
                        <Check /> I biblioteket
                      </>
                    ) : (
                      "Gem i bibliotek"
                    )}
                  </Button>
                </div>
                <ul className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-sm">
                  {s.occurrences.slice(0, 5).map((o, i) => (
                    <li key={i} className="flex min-w-0 gap-2">
                      <span className="shrink-0 font-semibold">{o.expert}:</span>
                      <a href={`#analyse-${o.analysisId}`} className="min-w-0 truncate text-muted-foreground hover:text-primary">
                        {o.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}

/* ─────────────────────────────── Dashboard ─────────────────────────────── */

export function Dashboard({ ctx }: { ctx: AppCtx }) {
  const [expert, setExpert] = React.useState("__all__");
  const experts = Array.from(new Set(ctx.store.analyses.map((a) => a.expertName))).sort((a, b) => a.localeCompare(b, "da"));
  const list = ctx.store.analyses.filter((a) => expert === "__all__" || a.expertName === expert);
  const d = aggregateDashboard(list.map(toRecord));
  const primary = [...REP_SYSTEMS].sort((a, b) => d.vakogAverage[b] - d.vakogAverage[a])[0]!;
  const needsExperts = d.needsByExpert.slice(0, 4);
  return (
    <Container>
      <PageHeader
        eyebrow="Dashboard"
        title="Mønstre på tværs af modeller"
        description="Meta-programmer, VAKOG, værdier, behov og overbevisninger — over tid og på tværs af eksperter."
        actions={
          <select id="dash-expert" aria-label="Filtrér på ekspert" className={cn(inputClass, "w-56")} value={expert} onChange={(e) => setExpert(e.target.value)}>
            <option value="__all__">Alle eksperter</option>
            {experts.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        }
      />
      {d.totals.analyses === 0 ? (
        <EmptyState icon={BarChart3} title="Ingen data" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: "Analyser", value: d.totals.analyses, icon: FileText },
              { label: "Eksperter", value: d.totals.experts, icon: Users },
              { label: "Strategier", value: d.totals.strategies, icon: Workflow },
              { label: "Styrkende", value: d.totals.enablingBeliefs, icon: ShieldCheck },
              { label: "Begrænsende", value: d.totals.disenablingBeliefs, icon: ShieldAlert },
            ].map((k) => (
              <Card key={k.label} className="p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  {k.label} <k.icon className="size-4" />
                </div>
                <div className="tabular mt-2 text-3xl font-bold tracking-[-0.03em]">{k.value}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-sans text-sm font-bold">VAKOG-fordeling</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Gennemsnit · primært {REP_SYSTEM_LABEL[primary].toLowerCase()}</p>
              <div className="mt-4">
                <DistributionBar distribution={d.vakogAverage} highlight={primary} />
                <VakogLegend distribution={d.vakogAverage} primary={primary} />
              </div>
              {d.vakogByExpert.length > 1 && (
                <div className="mt-5 flex flex-col gap-3 border-t pt-4">
                  <div className="text-xs font-semibold text-muted-foreground">Pr. ekspert</div>
                  {d.vakogByExpert.map((e) => (
                    <DistributionBar key={e.expert} size="sm" label={`${e.expert} · ${e.analyses} ${e.analyses === 1 ? "analyse" : "analyser"}`} distribution={Object.fromEntries(REP_SYSTEMS.map((s) => [s, e[s]]))} />
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-sm font-bold">Meta-programmer</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Tendens på tværs af analyser</p>
              <div className="mt-3 divide-y">
                {d.metaPrograms.map((m) => (
                  <MetaProgramScale key={m.program} name={`${m.name} · ${m.pole_a + m.pole_b + m.balanced} analyser`} poles={m.poles} leaning={Math.abs(m.tendency) < 10 ? "balanced" : m.tendency < 0 ? "pole_a" : "pole_b"} strength={Math.abs(m.tendency)} />
                ))}
              </div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <h2 className="font-sans text-sm font-bold">6 Human Needs</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{needsExperts.length > 1 ? "Pr. ekspert" : "Gennemsnit"}</p>
              <NeedsRadar
                axes={HUMAN_NEEDS.map((n) => HUMAN_NEED_LABEL[n])}
                series={needsExperts.length > 1 ? needsExperts.map((e, i) => ({ name: e.expert, color: COL(i), values: HUMAN_NEEDS.map((n) => e[n]) })) : [{ name: "Gennemsnit", color: COL(0), values: HUMAN_NEEDS.map((n) => d.needsAverage[n]) }]}
                size={220}
              />
              {needsExperts.length > 1 && (
                <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                  {needsExperts.map((e, i) => (
                    <span key={e.expert} className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ background: COL(i) }} /> {e.expert}
                    </span>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5 lg:col-span-2">
              <h2 className="font-sans text-sm font-bold">Overbevisninger over tid</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Antal pr. session</p>
              <div className="mt-4">
                <BeliefsOverTime rows={d.beliefsOverTime.map((b) => ({ label: `${b.expert}: ${b.label}`, date: formatDate(b.date, { day: "numeric", month: "short" }), enabling: b.enabling, disenabling: b.disenabling }))} />
              </div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="font-sans text-sm font-bold">Top-værdier</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Antal forekomster</p>
              <div className="mt-4">
                <HBarList items={d.topValues.map((v) => ({ label: v.value, value: v.count, hint: `${v.experts} ${v.experts === 1 ? "ekspert" : "eksperter"} · ${v.direction === "toward" ? "mod" : "væk fra"}` }))} />
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-sans text-sm font-bold">Strategityper</h2>
              <div className="mt-4">
                <HBarList items={Object.entries(d.strategyTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: STRATEGY_TYPE_LABEL[k as keyof typeof STRATEGY_TYPE_LABEL] ?? k, value: v }))} />
              </div>
              <div className="mt-5 border-t pt-4">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Dominerende behov</div>
                <HBarList items={HUMAN_NEEDS.filter((n) => d.dominantNeeds[n] > 0).sort((a, b) => d.dominantNeeds[b] - d.dominantNeeds[a]).map((n) => ({ label: HUMAN_NEED_LABEL[n], value: d.dominantNeeds[n] }))} />
              </div>
            </Card>
          </div>
        </div>
      )}
    </Container>
  );
}

export { SAMPLE_TRANSCRIPT };
