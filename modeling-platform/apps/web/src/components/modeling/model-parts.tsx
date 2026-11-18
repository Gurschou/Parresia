import { CircleCheck, Crosshair, Footprints, ScanSearch } from "lucide-react";
import type { ModelingMapResult } from "@bm/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Ikon pr. afsnit i kortet (navne fra CategoryIcon). */
export const MODELING_SECTION_ICON: Record<string, string> = {
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

export function SourceBadge({ source }: { source: "claude" | "heuristic" | null }) {
  if (!source) return null;
  return <Badge tone="outline">{source === "claude" ? "Claude" : "Tekstbaseret"}</Badge>;
}

/** Præcision som en lille ring + tal: andel af fundene, der står på ordrette citater. */
export function PrecisionRing({ value, size = 56, className }: { value: number; size?: number; className?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 80 ? "var(--positive)" : v >= 50 ? "var(--primary)" : "var(--warning)";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} role="img" aria-label={`Præcision ${v} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <span className="absolute font-mono text-[13px] font-semibold tabular-nums">{v}</span>
    </span>
  );
}

/** De tre ting, man skal se først: millimeteren, første træk og præcisionen. */
export function ModelGlance({ r, compact = false }: { r: ModelingMapResult; compact?: boolean }) {
  const m = r.map;
  const a = r.audit;
  const cards = [
    { icon: Crosshair, label: "Millimeteren", text: m.leverage.point, sub: m.leverage.why },
    { icon: Footprints, label: "Første træk", text: m.installation.focus || m.installation.actions[0]?.action || "", sub: m.installation.result },
  ];
  return (
    <div className={cn("grid gap-3", compact ? "md:grid-cols-3" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]")}>
      {cards.map((c) => (
        <div key={c.label} className="min-w-0 rounded-xl border bg-card p-4">
          <div className="eyebrow flex items-center gap-1.5 text-primary">
            <c.icon className="size-3.5" /> {c.label}
          </div>
          <p className="mt-2 font-semibold leading-snug text-pretty">{c.text || <span className="font-normal text-muted-foreground">Fremgår ikke endnu.</span>}</p>
          {!compact && c.sub && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">{c.sub}</p>}
        </div>
      ))}
      <div className="flex min-w-0 items-center gap-4 rounded-xl border bg-card p-4">
        <PrecisionRing value={a.precision} />
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-1.5 text-primary">
            <ScanSearch className="size-3.5" /> Præcision
          </div>
          <p className="mt-1 text-sm leading-snug">
            <span className="font-semibold">{a.findings_with_evidence} af {a.findings_total}</span> fund står på ordrette citater
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CircleCheck className="size-3" /> {a.quotes_verified} citater fundet i {a.sessions_used} {a.sessions_used === 1 ? "samtale" : "samtaler"}
          </p>
        </div>
      </div>
    </div>
  );
}
