import { ArrowRight, CornerDownLeft, Info, LogOut, Play, RefreshCw, TriangleAlert, CircleCheck } from "lucide-react";
import type { ReportBlock, ReportItem, Tone } from "@bm/core";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { repColorForLabel } from "./category-icon";
import { SavePatternButton } from "@/components/patterns/save-pattern-button";

const TONE_BADGE: Record<Tone, "neutral" | "positive" | "negative" | "info" | "warning"> = {
  neutral: "neutral",
  positive: "positive",
  negative: "negative",
  info: "info",
  warning: "warning",
};

export interface BlockContext {
  analysisId?: string;
  sectionKey: string;
  sectionTitle: string;
  /** Vis "Gem i mønsterbibliotek"-knapper. */
  savable?: boolean;
}

export function Quote({ text, className }: { text: string; className?: string }) {
  return (
    <blockquote
      className={cn(
        "border-l-2 border-primary/40 py-0.5 pl-3.5 font-serif text-[15px] italic leading-relaxed text-foreground/85",
        className,
      )}
    >
      “{text.trim()}”
    </blockquote>
  );
}

function ItemCard({ item, ctx }: { item: ReportItem; ctx: BlockContext }) {
  return (
    <div className="group relative rounded-xl border bg-card p-4 transition hover:border-primary/25 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-semibold leading-snug text-pretty">{item.title}</div>
        {ctx.savable && ctx.analysisId && (
          <SavePatternButton
            analysisId={ctx.analysisId}
            category={ctx.sectionKey}
            categoryTitle={ctx.sectionTitle}
            excerpt={{ label: item.title, detail: item.body, quotes: item.quotes?.filter(Boolean) }}
          />
        )}
      </div>
      {item.badges?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.badges.map((b, i) => (
            <Badge key={i} tone={TONE_BADGE[b.tone ?? "neutral"]}>
              {b.text}
            </Badge>
          ))}
        </div>
      ) : null}
      {item.body && <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground text-pretty">{item.body}</p>}
      {item.details?.length ? (
        <dl className="mt-3 grid gap-2">
          {item.details.map((d, i) => (
            <div key={i} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{d.label}</dt>
              <dd className="mt-0.5 text-pretty">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.quotes?.filter((q) => q.trim()).length ? (
        <div className="mt-3 space-y-2">
          {item.quotes.filter((q) => q.trim()).map((q, i) => (
            <Quote key={i} text={q} className="text-sm" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Bars({ block }: { block: Extract<ReportBlock, { type: "bars" }> }) {
  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-4">
      {block.title && <div className="text-sm font-semibold">{block.title}</div>}
      {block.items.map((it) => (
        <div key={it.label} className="grid grid-cols-[minmax(110px,180px)_1fr_56px] items-center gap-3 text-sm" title={`${it.label}: ${it.value}${block.unit ?? ""}`}>
          <span className={cn("truncate", it.highlight ? "font-semibold" : "text-muted-foreground")}>{it.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full transition-[width] duration-700", it.highlight ? "bg-primary" : "bg-primary/35")}
              style={{ width: `${Math.max(0, Math.min(100, (it.value / block.max) * 100))}%` }}
            />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">
            {Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}
            {block.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function Flow({ block }: { block: Extract<ReportBlock, { type: "flow" }> }) {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-card to-muted/40 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{block.title}</div>
      <ol className="flex flex-wrap items-stretch gap-2">
        {block.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className="flex max-w-56 flex-col rounded-lg border bg-card px-3 py-2 shadow-xs">
              <span className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: repColorForLabel(s.label) }} />
                <span className="font-mono text-sm font-semibold">{s.label}</span>
              </span>
              {s.caption && <span className="mt-1 text-xs leading-snug text-muted-foreground">{s.caption}</span>}
            </div>
            {i < block.steps.length - 1 && <ArrowRight className="size-4 shrink-0 text-muted-foreground" />}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <ArrowRight className="size-4 text-muted-foreground" />
          <span className="rounded-lg bg-secondary px-3 py-2 font-mono text-sm font-semibold text-secondary-foreground">Exit</span>
        </li>
      </ol>
    </div>
  );
}

/** TOTE-løkke: Trigger → Test ⇄ Operate → Exit. */
function Tote({ block }: { block: Extract<ReportBlock, { type: "tote" }> }) {
  const Node = ({ label, icon: Icon, children, className }: { label: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) => (
    <div className={cn("rounded-xl border bg-card p-3.5 shadow-xs", className)}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-sm leading-snug text-pretty">{children}</div>
    </div>
  );
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">TOTE-løkke</div>
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
        <Node label="Trigger" icon={Play}>{block.trigger || "—"}</Node>
        <ArrowRight className="mx-auto size-5 rotate-90 text-muted-foreground md:rotate-0" />
        <div className="space-y-2">
          <Node label="Test" icon={CircleCheck} className="border-primary/40 bg-secondary/40">
            {block.test || "—"}
          </Node>
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <RefreshCw className="size-3.5" /> ikke opfyldt → operate → test igen
          </div>
          <Node label="Operate" icon={CornerDownLeft}>
            {block.operate.length ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {block.operate.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </Node>
        </div>
        <ArrowRight className="mx-auto size-5 rotate-90 text-muted-foreground md:rotate-0" />
        <Node label="Exit" icon={LogOut} className="border-positive/30 bg-positive-soft/40">
          {block.exit || "—"}
        </Node>
      </div>
    </div>
  );
}

const CALLOUT_ICON: Record<Tone, React.ComponentType> = {
  info: Info,
  warning: TriangleAlert,
  negative: TriangleAlert,
  positive: CircleCheck,
  neutral: Info,
};

export function ReportBlocks({ blocks, ctx }: { blocks: ReportBlock[]; ctx: BlockContext }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return (
              <p key={i} className="leading-relaxed text-foreground/90 text-pretty">
                {b.text}
              </p>
            );
          case "subheading":
            return (
              <h4 key={i} className="pt-2 font-sans text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {b.text}
              </h4>
            );
          case "bullets":
            return (
              <ul key={i} className="space-y-2">
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
            const Icon = CALLOUT_ICON[b.tone];
            const tone = b.tone === "neutral" ? "neutral" : b.tone;
            return (
              <Alert key={i} tone={tone}>
                <Icon />
                <div>
                  {b.title && <div className="font-semibold">{b.title}</div>}
                  <div className="text-muted-foreground text-pretty">{b.text}</div>
                </div>
              </Alert>
            );
          }
          case "keyvalue":
            return (
              <dl key={i} className="grid gap-3 sm:grid-cols-2">
                {b.items.map((kv, j) => (
                  <div key={j} className="rounded-xl border bg-card px-4 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{kv.label}</dt>
                    <dd className="mt-1 font-semibold text-pretty">{kv.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "bars":
            return <Bars key={i} block={b} />;
          case "flow":
            return <Flow key={i} block={b} />;
          case "tote":
            return <Tote key={i} block={b} />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {b.headers.map((h) => (
                        <th key={h} className="px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className={cn("px-3.5 py-2.5 align-top text-pretty", k === 0 && "font-medium")}>
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
