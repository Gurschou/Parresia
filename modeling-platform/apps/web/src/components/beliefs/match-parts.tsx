import Link from "next/link";
import { ArrowRight, CornerDownRight } from "lucide-react";
import { ANCHOR_TYPE_LABEL, BELIEF_TYPE_LABEL, MATCH_KIND_LABEL, genitive, type BeliefMatch, type MatchKind } from "@bm/core";
import { Badge } from "@/components/ui/badge";
import { colorSlot, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Pronominer til overskrifter: "dig/dine" for brugeren selv, ellers navnet. */
export function who(p: { name: string; isSelf?: boolean } | null | undefined) {
  if (!p) return { obj: "personen", poss: "personens", Poss: "Personens" };
  return p.isSelf ? { obj: "dig", poss: "dine", Poss: "Dine" } : { obj: p.name, poss: genitive(p.name), Poss: genitive(p.name) };
}

export function PersonAvatar({ name, seed, className }: { name: string; seed: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", className)}
      style={{ background: `var(--series-${colorSlot(seed)})` }}
    >
      {initials(name)}
    </span>
  );
}

const KIND_TONE: Record<MatchKind, "positive" | "info" | "neutral"> = { counter: "positive", fit: "info", shared: "neutral" };

export function KindBadge({ kind }: { kind: MatchKind }) {
  return <Badge tone={KIND_TONE[kind]}>{MATCH_KIND_LABEL[kind]}</Badge>;
}

/** Pasform 0-100 som en lille skala + tal i notationsskriften. */
export function FitMeter({ fit, className }: { fit: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={`Pasform ${fit} af 100`}>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(4, Math.min(100, fit))}%` }} />
      </span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{fit}</span>
    </span>
  );
}

const typeLabel = (t: string) => BELIEF_TYPE_LABEL[t as keyof typeof BELIEF_TYPE_LABEL] ?? t;

/**
 * Ét match. `side` afgør, hvem der vises som modparten: "from" (hvem
 * overbevisningen kommer fra) eller "to" (hvem den passer til).
 */
export function MatchItem({
  match: m,
  side,
  showAnchor = true,
  hideParty = false,
  className,
}: {
  match: BeliefMatch;
  side: "from" | "to";
  showAnchor?: boolean;
  hideParty?: boolean;
  className?: string;
}) {
  const other = side === "from" ? m.from : m.to;
  return (
    <article className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <KindBadge kind={m.kind} />
        <FitMeter fit={m.fit} />
        <span className={cn("ml-auto inline-flex min-w-0 items-center gap-2 text-sm", hideParty && "hidden")}>
          <span className="text-muted-foreground">{side === "from" ? "fra" : "til"}</span>
          <PersonAvatar name={other.name} seed={other.expertId ?? other.personKey} className="size-6 rounded-md text-[10px]" />
          <Link href={`/analyses/${other.analysisId}`} className="truncate font-semibold hover:text-primary">
            {other.name}
          </Link>
        </span>
      </div>
      <h4 className="font-display text-[1.15rem] font-bold leading-snug tracking-[-0.01em] text-balance">{m.belief.statement}</h4>
      {m.belief.quote && (
        <blockquote className="said text-[15px] leading-relaxed text-foreground/85">
          <span className="marked">“{m.belief.quote}”</span>
        </blockquote>
      )}
      {m.rationale && <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{m.rationale}</p>}
      {showAnchor && m.anchor.type !== "none" && m.anchor.text && (
        <p className="flex items-start gap-2 text-sm">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="eyebrow mr-1.5 text-muted-foreground">{ANCHOR_TYPE_LABEL[m.anchor.type]}</span>
            <span className="text-foreground/90">{m.anchor.text}</span>
          </span>
        </p>
      )}
      {m.bridgeQuestion && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-3.5 py-2.5 text-sm">
          <span className="eyebrow mr-2 text-primary">Prøv den på</span>
          <span className="italic text-pretty">{m.bridgeQuestion}</span>
        </p>
      )}
      <div className="font-mono text-[11px] text-muted-foreground">
        {m.belief.kind === "enabling" ? "Styrkende" : "Begrænsende"} · {typeLabel(m.belief.type)}
      </div>
    </article>
  );
}

/** Kompakt linje til lister (oversigt og rapport). */
export function MatchLine({ match: m, side }: { match: BeliefMatch; side: "from" | "to" }) {
  const other = side === "from" ? m.from : m.to;
  return (
    <div className="flex items-start gap-3">
      <PersonAvatar name={other.name} seed={other.expertId ?? other.personKey} className="mt-0.5 size-7 rounded-md text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-snug text-pretty">{m.belief.statement}</div>
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
