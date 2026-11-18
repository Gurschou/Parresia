import * as React from "react";
import {
  ArrowRight,
  BookmarkPlus,
  BookOpenText,
  Braces,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Copy,
  CornerDownLeft,
  Cpu,
  Eye,
  FileDown,
  FileText,
  Gauge,
  HeartPulse,
  Info,
  LogOut,
  MessageSquareQuote,
  Play,
  RefreshCw,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORIES,
  HUMAN_NEEDS,
  HUMAN_NEED_LABEL,
  META_PROGRAMS,
  REP_SYSTEM_LABEL,
  buildReport,
  cn,
  formatDate,
  formatNumber,
  renderMarkdown,
  slug,
  type CategoryDefinition,
  type ReportBlock,
  type ReportItem,
  type Tone,
} from "./lib";
import { Badge, Button, Card, Field, Modal, inputClass, type BadgeTone } from "./ui";
import { DistributionBar, MetaProgramScale, NeedsRadar, VakogLegend, repColorForLabel } from "./charts";
import type { StoredAnalysis, StoredPattern } from "./store";
import type { AppCtx } from "./app-ctx";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  workflow: Workflow,
  "shield-check": ShieldCheck,
  "shield-alert": ShieldAlert,
  "heart-pulse": HeartPulse,
  "sliders-horizontal": SlidersHorizontal,
  "message-square-quote": MessageSquareQuote,
  eye: Eye,
  "scan-eye": ScanEye,
  "circle-help": CircleHelp,
};
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name] ?? Sparkles;
  return <I className={className} />;
}

const TONE: Record<Tone, BadgeTone> = { neutral: "neutral", positive: "positive", negative: "negative", info: "info", warning: "warning" };

/** Personens egne ord: kursiv serif med tusch-markering. */
export function Quote({ text, className }: { text: string; className?: string }) {
  return (
    <blockquote className={cn("said text-pretty text-[15px] leading-[1.65]", className)}>
      <span className="marked">“{text.trim()}”</span>
    </blockquote>
  );
}

interface BlockCtx {
  onSave?: (item: ReportItem) => void;
}

function ItemCard({ item, ctx }: { item: ReportItem; ctx: BlockCtx }) {
  const quotes = (item.quotes ?? []).filter((q) => q.trim());
  return (
    <div className="group relative min-w-0 rounded-xl border bg-card p-4 transition hover:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-pretty min-w-0 leading-snug font-semibold">{item.title}</div>
        {ctx.onSave && (
          <button
            onClick={() => ctx.onSave!(item)}
            data-tip="Gem i mønsterbibliotek"
            aria-label="Gem i mønsterbibliotek"
            className="tip -m-1 cursor-pointer rounded-md p-1 text-muted-foreground opacity-60 transition group-hover:opacity-100 hover:bg-muted hover:text-primary focus-visible:opacity-100"
          >
            <BookmarkPlus className="size-4" />
          </button>
        )}
      </div>
      {item.badges?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.badges.map((b, i) => (
            <Badge key={i} tone={TONE[b.tone ?? "neutral"]}>
              {b.text}
            </Badge>
          ))}
        </div>
      ) : null}
      {item.body && <p className="text-pretty mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>}
      {item.details?.length ? (
        <dl className="mt-3 flex flex-col gap-2">
          {item.details.map((d, i) => (
            <div key={i} className="rounded-lg bg-muted px-3 py-2 text-sm">
              <dt className="eyebrow text-[10px] text-muted-foreground">{d.label}</dt>
              <dd className="text-pretty mt-0.5">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {quotes.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {quotes.map((q, i) => (
            <Quote key={i} text={q} className="text-sm" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Tote({ b }: { b: Extract<ReportBlock, { type: "tote" }> }) {
  const Node = ({ label, icon: I, children, style }: { label: string; icon: LucideIcon; children: React.ReactNode; style?: React.CSSProperties }) => (
    <div className="min-w-0 rounded-xl border bg-card p-3.5" style={style}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
        <I className="size-3.5" /> {label}
      </div>
      <div className="text-pretty text-sm leading-snug">{children}</div>
    </div>
  );
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-4">
      <div className="mb-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">TOTE-løkke</div>
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
        <Node label="Trigger" icon={Play}>
          {b.trigger || "—"}
        </Node>
        <ArrowRight className="mx-auto size-5 rotate-90 text-muted-foreground md:rotate-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <Node label="Test" icon={CircleCheck} style={{ background: "color-mix(in oklch, var(--secondary) 60%, var(--card))", borderColor: "color-mix(in oklch, var(--primary) 35%, transparent)" }}>
            {b.test || "—"}
          </Node>
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <RefreshCw className="size-3.5" /> ikke opfyldt → operate → test igen
          </div>
          <Node label="Operate" icon={CornerDownLeft}>
            {b.operate.length ? (
              <ul className="list-disc pl-4">
                {b.operate.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </Node>
        </div>
        <ArrowRight className="mx-auto size-5 rotate-90 text-muted-foreground md:rotate-0" />
        <Node label="Exit" icon={LogOut} style={{ background: "color-mix(in oklch, var(--positive-soft) 70%, var(--card))", borderColor: "color-mix(in oklch, var(--positive) 30%, transparent)" }}>
          {b.exit || "—"}
        </Node>
      </div>
    </div>
  );
}

const CALLOUT: Record<Tone, { icon: LucideIcon; bg: string; fg: string }> = {
  info: { icon: Info, bg: "var(--info-soft)", fg: "var(--info)" },
  warning: { icon: TriangleAlert, bg: "var(--warning-soft)", fg: "var(--warning)" },
  negative: { icon: TriangleAlert, bg: "var(--negative-soft)", fg: "var(--negative)" },
  positive: { icon: CircleCheck, bg: "var(--positive-soft)", fg: "var(--positive)" },
  neutral: { icon: Info, bg: "var(--muted)", fg: "var(--muted-foreground)" },
};

export function ReportBlocks({ blocks, ctx }: { blocks: ReportBlock[]; ctx: BlockCtx }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return (
              <p key={i} className="text-pretty leading-relaxed text-foreground/90">
                {b.text}
              </p>
            );
          case "subheading":
            return (
              <h4 key={i} className="pt-2 font-sans text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {b.text}
              </h4>
            );
          case "bullets":
            return (
              <ul key={i} className="flex flex-col gap-2">
                {b.items.map((t, j) => (
                  <li key={j} className="flex gap-3 leading-relaxed">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-pretty">{t}</span>
                  </li>
                ))}
              </ul>
            );
          case "items":
            return b.items.length ? (
              <div key={i} className={b.items.length > 1 ? "grid gap-3 xl:grid-cols-2" : "grid gap-3"}>
                {b.items.map((it, j) => (
                  <ItemCard key={j} item={it} ctx={ctx} />
                ))}
              </div>
            ) : (
              <p key={i} className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {b.emptyText ?? "Ingen fund."}
              </p>
            );
          case "quote":
            return <Quote key={i} text={b.text} />;
          case "callout": {
            const c = CALLOUT[b.tone];
            return (
              <div key={i} role="note" className="flex gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: c.bg }}>
                <c.icon className="mt-0.5 size-4 shrink-0" style={{ color: c.fg }} />
                <div className="min-w-0">
                  {b.title && <div className="font-semibold">{b.title}</div>}
                  <div className="text-pretty text-muted-foreground">{b.text}</div>
                </div>
              </div>
            );
          }
          case "keyvalue":
            return (
              <dl key={i} className="grid gap-3 sm:grid-cols-2">
                {b.items.map((kv, j) => (
                  <div key={j} className="min-w-0 rounded-xl border bg-card px-4 py-3">
                    <dt className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{kv.label}</dt>
                    <dd className="text-pretty mt-1 font-semibold">{kv.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "bars":
            return (
              <div key={i} className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
                {b.items.map((it) => (
                  <div key={it.label} className="grid grid-cols-[minmax(96px,170px)_1fr_52px] items-center gap-3 text-sm">
                    <span className={cn("truncate", it.highlight ? "font-semibold" : "text-muted-foreground")}>{it.label}</span>
                    <span className="h-2.5 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, (it.value / b.max) * 100))}%`, background: it.highlight ? "var(--primary)" : "color-mix(in oklch, var(--primary) 35%, transparent)" }}
                      />
                    </span>
                    <span className="tabular text-right text-muted-foreground">
                      {Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}
                      {b.unit}
                    </span>
                  </div>
                ))}
              </div>
            );
          case "flow":
            return (
              <div key={i} className="rounded-xl border bg-muted/40 p-4">
                <div className="eyebrow mb-3 text-muted-foreground">{b.title}</div>
                <ol className="flex flex-wrap items-stretch gap-2">
                  {b.steps.map((s, j) => (
                    <li key={j} className="flex min-w-0 items-center gap-2">
                      <div className="flex max-w-56 min-w-0 flex-col rounded-md border bg-card px-3 py-2" style={{ boxShadow: `inset 0 -3px 0 ${repColorForLabel(s.label)}` }}>
                        <span className="font-mono text-sm font-semibold">{s.label}</span>
                        {s.caption && <span className="mt-1 text-xs leading-snug text-muted-foreground">{s.caption}</span>}
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </li>
                  ))}
                  <li className="flex items-center">
                    <span className="rounded-md bg-foreground px-3 py-2 font-mono text-sm font-semibold text-background">Exit</span>
                  </li>
                </ol>
              </div>
            );
          case "tote":
            return <Tote key={i} b={b} />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {b.headers.map((h) => (
                        <th key={h} className="px-3.5 py-2.5 text-left text-[11px] font-bold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className={cn("text-pretty px-3.5 py-2.5 align-top", k === 0 && "font-medium")}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

function Toc({ sections }: { sections: { key: string; title: string; icon: string; count: number }[] }) {
  const [active, setActive] = React.useState(sections[0]?.key);
  React.useEffect(() => {
    const els = sections.map((s) => document.getElementById(`sec-${s.key}`)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setActive(v.target.id.slice(4));
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);
  return (
    <nav aria-label="Indhold" className="flex flex-col gap-0.5">
      <div className="eyebrow mb-3 px-3 text-muted-foreground">Indhold</div>
      {sections.map((s) => (
        <button
          key={s.key}
          onClick={() => document.getElementById(`sec-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
            active === s.key && "bg-secondary font-semibold text-secondary-foreground",
          )}
        >
          <CategoryIcon name={s.icon} className={cn("mt-0.5 size-4 shrink-0", active === s.key && "text-primary")} />
          <span className="min-w-0 leading-snug">{s.title}</span>
          {s.count > 0 && <span className="tabular ml-auto font-mono text-[11px] opacity-70">{s.count}</span>}
        </button>
      ))}
    </nav>
  );
}

function Stat({ icon: I, label, value, hint }: { icon: LucideIcon; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 bg-card px-5 py-4">
      <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <I className="size-4 shrink-0" /> <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-3xl font-bold tracking-[-0.03em]">{value}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

function SavePatternModal({ ctx, analysis, item, categoryKey, categoryTitle, onClose }: { ctx: AppCtx; analysis: StoredAnalysis; item: ReportItem; categoryKey: string; categoryTitle: string; onClose: () => void }) {
  const existing = ctx.store.patterns.filter((p) => p.category === categoryKey);
  const [target, setTarget] = React.useState("__new__");
  const [title, setTitle] = React.useState(item.title.slice(0, 120));
  const [description, setDescription] = React.useState(item.body ?? "");
  const [tags, setTags] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const example = { analysisId: analysis.id, analysisTitle: analysis.title, expertName: analysis.expertName, label: item.title, detail: item.body, quotes: (item.quotes ?? []).filter(Boolean) };

  async function save() {
    setBusy(true);
    try {
      if (target === "__new__") {
        const p: StoredPattern = {
          id: Math.random().toString(36).slice(2, 10),
          title: title.trim() || item.title,
          category: categoryKey,
          description: description.trim(),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          examples: [example],
          createdAt: new Date().toISOString(),
        };
        await ctx.store.savePattern(p);
      } else {
        const p = existing.find((x) => x.id === target)!;
        await ctx.store.savePattern({ ...p, examples: [...p.examples, example] });
      }
      ctx.toast("Gemt i mønsterbiblioteket", "positive");
      onClose();
    } catch {
      ctx.toast("Kunne ikke gemme mønstret. Prøv igen.", "negative");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Gem i mønsterbibliotek" description={`${categoryTitle} · ${analysis.expertName}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Mønster" htmlFor="pt-target">
          <select id="pt-target" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="__new__">+ Nyt mønster</option>
            {existing.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        {target === "__new__" && (
          <>
            <Field label="Titel" htmlFor="pt-title">
              <input id="pt-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <Field label="Beskrivelse" htmlFor="pt-desc">
              <textarea id="pt-desc" className={cn(inputClass, "min-h-20")} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Tags" htmlFor="pt-tags" hint="Kommasepareret">
              <input id="pt-tags" className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="forberedelse, beslutning" />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annullér
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Gemmer…" : "Gem"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

async function downloadPdf(ctx: AppCtx, a: StoredAnalysis) {
  const [{ pdf }, { ReportPdf }] = await Promise.all([import("@react-pdf/renderer"), import("../../../packages/core/src/report/pdf-document")]);
  const doc = buildReport(a.result, { expertName: a.expertName, sessionDate: a.sessionDate, model: a.meta.provider === "claude" ? `Claude (${a.meta.modelTier ?? "default"})` : a.meta.provider === "demo" ? "Demo-analyse" : "Eksempel" });
  const blob = await pdf(React.createElement(ReportPdf, { doc }) as Parameters<typeof pdf>[0]).toBlob();
  return ctx.download(`adfaerdsmodel-${slug(a.expertName)}-${a.sessionDate}.pdf`, blob);
}

export function ReportView({ ctx, analysis: a }: { ctx: AppCtx; analysis: StoredAnalysis }) {
  const r = a.result;
  const [saving, setSaving] = React.useState<{ item: ReportItem; key: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const categories = CATEGORIES as readonly CategoryDefinition[];
  const doc = React.useMemo(() => buildReport(r, { expertName: a.expertName, sessionDate: a.sessionDate }), [r, a.expertName, a.sessionDate]);
  const counts = Object.fromEntries(categories.map((c) => [c.key, c.count((r as Record<string, unknown>)[c.key])]));
  const programs = [...r.meta_programs.programs].sort((x, y) => y.strength - x.strength).slice(0, 6);
  const markdown = () => renderMarkdown(buildReport(r, { expertName: a.expertName, sessionDate: a.sessionDate, model: a.meta.modelTier }));
  const base = `adfaerdsmodel-${slug(a.expertName)}-${a.sessionDate}`;
  const providerLabel = a.meta.provider === "claude" ? `Claude · ${a.meta.modelTier === "complex" ? "grundig" : a.meta.modelTier ?? "default"}` : a.meta.provider === "demo" ? "Demo-analyse (uden Claude)" : "Eksempel-analyse";

  return (
    <div>
      <section className="border-b">
        <div className="gutter mx-auto max-w-7xl pt-7 pb-9">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
            <a href="#analyser" className="hover:text-foreground">
              Analyser
            </a>
            <ChevronRight className="size-3.5" />
            <span className="truncate text-foreground">{a.title}</span>
          </nav>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="eyebrow mb-3 text-primary">Adfærdsmodel</div>
              <h1 className="text-[2.6rem] leading-[1] sm:text-6xl">{r.summary.subject}</h1>
              <p className="text-pretty mt-4 text-xl leading-snug text-muted-foreground">{r.summary.result_modeled}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone="outline">
                  <User /> <a href={`#ekspert-${slug(a.expertName)}`}>{a.expertName}</a>
                </Badge>
                <Badge tone="outline">
                  <CalendarDays /> {formatDate(a.sessionDate || a.createdAt)}
                </Badge>
                <Badge tone={a.example ? "warning" : a.meta.provider === "demo" ? "neutral" : "primary"}>
                  <Cpu /> {providerLabel}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ctx.canDownload ? (
                <>
                  <Button
                    disabled={pdfBusy}
                    onClick={async () => {
                      setPdfBusy(true);
                      await downloadPdf(ctx, a).catch(() => ctx.toast("PDF'en kunne ikke laves.", "negative"));
                      setPdfBusy(false);
                    }}
                  >
                    <FileDown /> {pdfBusy ? "Laver PDF…" : "PDF-rapport"}
                  </Button>
                  <Button variant="outline" onClick={() => void ctx.download(`${base}.md`, markdown())}>
                    <FileText /> Markdown
                  </Button>
                  <Button variant="outline" onClick={() => void ctx.download(`${base}.json`, JSON.stringify({ schema_version: 1, result: r, meta: a.meta }, null, 2))}>
                    <Braces /> JSON
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => void ctx.copy(markdown(), "Rapporten er kopieret som Markdown")}>
                  <Copy /> Kopiér som Markdown
                </Button>
              )}
              {!a.example && (
                <Button variant="ghost" size="icon" aria-label="Slet analyse" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="gutter mx-auto max-w-7xl py-8">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border xl:grid-cols-4">
          <Stat icon={Workflow} label="Strategier" value={r.cognitive_strategies.strategies.length} hint={`${r.cognitive_strategies.strategies.filter((s) => s.transferable).length} overførbare`} />
          <Stat icon={ShieldCheck} label="Styrkende overbevisninger" value={r.enabling_beliefs.beliefs.length} />
          <Stat icon={ShieldAlert} label="Begrænsende overbevisninger" value={r.disenabling_beliefs.beliefs.length} />
          <Stat icon={Gauge} label="Næste spørgsmål" value={r.gaps_and_next_questions.next_questions.length} hint={`${r.gaps_and_next_questions.gaps.length} mangler i modellen`} />
        </dl>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-sans text-sm font-bold">VAKOG-profil</h3>
              <span className="text-xs text-muted-foreground">Primært: {REP_SYSTEM_LABEL[r.vakog.primary_system]}</span>
            </div>
            <div className="mt-4">
              <DistributionBar distribution={r.vakog.distribution} highlight={r.vakog.primary_system} />
              <VakogLegend distribution={r.vakog.distribution} primary={r.vakog.primary_system} />
              {a.meta.lexicon && a.meta.lexicon.total > 0 && (
                <div className="mt-4 border-t pt-3">
                  <DistributionBar size="sm" distribution={a.meta.lexicon.distribution} label={`Leksikon-krydstjek · ${a.meta.lexicon.total} prædikater talt`} />
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-sans text-sm font-bold">6 Human Needs</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Dominerende: {r.values_and_6_human_needs.dominant_needs.map((n) => HUMAN_NEED_LABEL[n]).join(" og ") || "—"}</p>
            <NeedsRadar axes={HUMAN_NEEDS.map((n) => HUMAN_NEED_LABEL[n])} series={[{ name: "Score", color: "var(--series-1)", values: HUMAN_NEEDS.map((n) => r.values_and_6_human_needs.human_needs[n].score) }]} size={230} />
          </Card>
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-sans text-sm font-bold">Meta-programmer</h3>
              <span className="text-xs text-muted-foreground">{r.meta_programs.programs.length} identificeret</span>
            </div>
            <div className="mt-2 divide-y">
              {programs.map((p) => (
                <MetaProgramScale key={p.program} name={META_PROGRAMS[p.program].name} poles={META_PROGRAMS[p.program].poles} leaning={p.leaning} strength={p.strength} />
              ))}
              {!programs.length && <p className="py-6 text-center text-sm text-muted-foreground">Ingen meta-programmer med belæg.</p>}
            </div>
          </Card>
        </div>

        <Card className="mt-4 overflow-hidden">
          <div className="grid lg:grid-cols-[1.4fr_1fr]">
            <div className="p-6 sm:p-8">
              <h2 className="text-2xl">Sammenfatning</h2>
              <p className="text-pretty mt-3 text-[17px] leading-relaxed text-foreground/90">{r.summary.overview}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-semibold">Kildegrundlag:</span> {r.summary.source_quality}
              </p>
            </div>
            <div className="border-t bg-muted/40 p-6 sm:p-8 lg:border-t-0 lg:border-l">
              <h3 className="eyebrow text-muted-foreground">Nøgleindsigter</h3>
              <ul className="mt-4 flex flex-col gap-3.5">
                {r.summary.key_insights.map((k, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-[7px] size-2 shrink-0 rotate-45 bg-primary" />
                    <span className="text-pretty leading-snug">{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky" style={{ top: "calc(24px + env(safe-area-inset-top, 0px))" }}>
              <Toc sections={doc.sections.filter((s) => s.key !== "summary").map((s) => ({ key: s.key, title: s.title, icon: categories.find((c) => c.key === s.key)?.icon ?? "sparkles", count: counts[s.key] ?? 0 }))} />
            </div>
          </aside>
          <div className="flex min-w-0 flex-col gap-6">
            {doc.sections
              .filter((s) => s.key !== "summary")
              .map((s) => {
                const cat = categories.find((c) => c.key === s.key)!;
                return (
                  <section key={s.key} id={`sec-${s.key}`} className="scroll-mt-6">
                    <Card className="p-6 sm:p-8">
                      <header className="mb-6 flex items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
                          <CategoryIcon name={cat.icon} className="size-5 text-secondary-foreground" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-2xl">{s.title}</h2>
                          <p className="text-pretty mt-1 text-sm text-muted-foreground">{s.description}</p>
                        </div>
                      </header>
                      <ReportBlocks blocks={s.blocks} ctx={{ onSave: (item) => setSaving({ item, key: s.key, title: s.title }) }} />
                    </Card>
                  </section>
                );
              })}
            <details className="group rounded-2xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-6 font-semibold">
                <BookOpenText className="size-5 text-primary" /> Transskript
                <span className="text-sm font-normal text-muted-foreground">{formatNumber(a.transcript.length)} tegn</span>
                <ChevronRight className="ml-auto size-4 transition group-open:rotate-90" />
              </summary>
              <div className="max-h-[480px] overflow-y-auto border-t px-6 py-5">
                <pre className="font-mono text-[13px] leading-6 whitespace-pre-wrap text-foreground/85">{a.transcript}</pre>
              </div>
            </details>
          </div>
        </div>
      </div>

      {saving && <SavePatternModal ctx={ctx} analysis={a} item={saving.item} categoryKey={saving.key} categoryTitle={saving.title} onClose={() => setSaving(null)} />}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Slet analysen?" description={`“${a.title}” slettes permanent.`}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Annullér
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await ctx.store.deleteAnalysis(a.id).catch(() => ctx.toast("Kunne ikke slette analysen.", "negative"));
              setConfirmDelete(false);
              location.hash = "analyser";
              ctx.toast("Analysen er slettet", "positive");
            }}
          >
            Slet
          </Button>
        </div>
      </Modal>
    </div>
  );
}
