import * as React from "react";
import { REP_SYSTEM_LABEL, cn } from "./lib";

const REP_ORDER = ["V", "A", "K", "O", "G", "Ad"] as const;
type Rep = (typeof REP_ORDER)[number];

export const REP_COLOR: Record<Rep, string> = {
  V: "var(--series-1)",
  A: "var(--series-2)",
  K: "var(--series-3)",
  O: "var(--series-4)",
  G: "var(--series-5)",
  Ad: "var(--series-6)",
};
const SHORT: Record<Rep, string> = { V: "Visuelt", A: "Auditivt", K: "Kinæstetisk", O: "Olfaktorisk", G: "Gustatorisk", Ad: "Aud. digitalt" };

export function repColorForLabel(label: string): string {
  if (label.startsWith("Ad")) return REP_COLOR.Ad;
  return REP_COLOR[(label[0] ?? "V") as Rep] ?? "var(--muted-foreground)";
}

/** 100 %-stablet bjælke med 2px mellemrum og hover-tooltip pr. segment. */
export function DistributionBar({ distribution, highlight, label, size = "md" }: { distribution: Record<string, number>; highlight?: string; label?: string; size?: "sm" | "md" }) {
  const total = REP_ORDER.reduce((a, s) => a + (distribution[s] ?? 0), 0) || 1;
  return (
    <div>
      {label && <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</div>}
      <div className={cn("flex w-full gap-[2px] rounded-full bg-muted", size === "md" ? "h-4" : "h-2.5")} role="img" aria-label={REP_ORDER.map((s) => `${REP_SYSTEM_LABEL[s]} ${Math.round(distribution[s] ?? 0)}%`).join(", ")}>
        {REP_ORDER.filter((s) => (distribution[s] ?? 0) > 0).map((s) => (
          <span
            key={s}
            tabIndex={0}
            data-tip={`${REP_SYSTEM_LABEL[s]} (${s}) · ${Math.round(distribution[s] ?? 0)} %`}
            className={cn("tip h-full first:rounded-l-full last:rounded-r-full hover:brightness-110", highlight && highlight !== s && "opacity-70")}
            style={{ width: `${((distribution[s] ?? 0) / total) * 100}%`, background: REP_COLOR[s] }}
          />
        ))}
      </div>
    </div>
  );
}

export function VakogLegend({ distribution, primary }: { distribution: Record<string, number>; primary?: string }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
      {REP_ORDER.map((s) => (
        <li key={s} className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: REP_COLOR[s] }} />
          <span className={cn("truncate", s === primary ? "font-semibold" : "text-muted-foreground")}>{SHORT[s]}</span>
          <span className="tabular ml-auto text-muted-foreground">{Math.round(distribution[s] ?? 0)}%</span>
        </li>
      ))}
    </ul>
  );
}

/** Radar over de 6 Human Needs (0-10); flere serier overlejres. */
export function NeedsRadar({ axes, series, size = 260 }: { axes: string[]; series: { name: string; color: string; values: number[] }[]; size?: number }) {
  const [hover, setHover] = React.useState<{ s: number; i: number } | null>(null);
  const w = size + 120;
  const h = size + 40;
  const cx = w / 2;
  const cy = h / 2;
  const r = size / 2 - 6;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    return [cx + Math.cos(a) * r * (v / 10), cy + Math.sin(a) * r * (v / 10)] as const;
  };
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(",")).join(" ");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto block w-full max-w-[420px]" role="img" aria-label={series.map((s) => `${s.name}: ${axes.map((a, i) => `${a} ${s.values[i]}`).join(", ")}`).join("; ")}>
        {[2, 4, 6, 8, 10].map((v) => (
          <polygon key={v} points={ring(v)} fill="none" stroke="var(--chart-grid)" strokeWidth={1} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 10);
          const [lx, ly] = pt(i, 11.8);
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end"} dominantBaseline="middle" fill="var(--muted-foreground)" fontSize={11} fontWeight={600}>
                {a}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => (
          <g key={s.name}>
            <polygon points={s.values.map((v, i) => pt(i, v).join(",")).join(" ")} fill={s.color} fillOpacity={series.length > 1 ? 0.08 : 0.18} stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [x, y] = pt(i, v);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={hover?.s === si && hover.i === i ? 6 : 4}
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                  onMouseEnter={() => setHover({ s: si, i })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </g>
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background">
          {series[hover.s]!.name}: {axes[hover.i]} {series[hover.s]!.values[hover.i]} / 10
        </div>
      )}
    </div>
  );
}

const shortPole = (p: string) => p.replace(/\s*\(.*\)\s*$/, "");

/** Bipolær skala: pol A ← → pol B, markør efter retning og styrke. */
export function MetaProgramScale({ name, poles, leaning, strength }: { name: string; poles: readonly [string, string]; leaning: "pole_a" | "pole_b" | "balanced"; strength: number }) {
  const pos = leaning === "balanced" ? 50 : leaning === "pole_a" ? 50 - strength / 2 : 50 + strength / 2;
  const active = leaning === "balanced" ? "Balanceret" : shortPole(leaning === "pole_a" ? poles[0] : poles[1]);
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{name}</span>
        <span className="truncate text-xs font-bold">{active}</span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2" style={{ background: "var(--chart-axis)" }} />
        <span
          tabIndex={0}
          data-tip={`${active} · styrke ${Math.round(strength)}/100`}
          className="tip absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-primary shadow-md"
          style={{ left: `${Math.max(4, Math.min(96, pos))}%`, borderColor: "var(--card)" }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[10.5px] text-muted-foreground">
        <span className={cn("truncate", leaning === "pole_a" && "font-semibold text-foreground")}>{shortPole(poles[0])}</span>
        <span className={cn("truncate text-right", leaning === "pole_b" && "font-semibold text-foreground")}>{shortPole(poles[1])}</span>
      </div>
    </div>
  );
}

/** Vandrette søjler med direkte labels og værdier. */
export function HBarList({ items, unit = "", max }: { items: { label: string; value: number; hint?: string; highlight?: boolean }[]; unit?: string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-sm">
          <span className={cn("truncate", it.highlight ? "font-semibold" : "text-muted-foreground")} title={it.label}>
            {it.label}
          </span>
          <span className="tip h-2.5 rounded-full bg-muted" tabIndex={0} data-tip={`${it.label}: ${it.value}${unit}${it.hint ? ` · ${it.hint}` : ""}`}>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (it.value / m) * 100)}%`, background: it.highlight === false ? "color-mix(in oklch, var(--series-1) 45%, transparent)" : "var(--series-1)" }} />
          </span>
          <span className="tabular w-12 text-right text-muted-foreground">
            {Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Grupperede søjler pr. session: styrkende vs. begrænsende overbevisninger. */
export function BeliefsOverTime({ rows }: { rows: { label: string; date: string; enabling: number; disenabling: number }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.enabling, r.disenabling]));
  const H = 160;
  return (
    <div>
      <div className="flex items-end gap-4 overflow-x-auto pb-1" style={{ height: H + 44 }}>
        {rows.map((r, i) => (
          <div key={i} className="flex min-w-[64px] flex-1 flex-col items-center gap-2">
            <div className="flex items-end gap-[2px]" style={{ height: H }}>
              {(
                [
                  ["enabling", "Styrkende", "var(--series-1)"],
                  ["disenabling", "Begrænsende", "var(--series-2)"],
                ] as const
              ).map(([k, name, color]) => (
                <span
                  key={k}
                  tabIndex={0}
                  data-tip={`${r.label}: ${r[k]} ${name.toLowerCase()}`}
                  className="tip w-4 rounded-t-[4px]"
                  style={{ height: Math.max(3, (r[k] / max) * H), background: color }}
                />
              ))}
            </div>
            <span className="max-w-[90px] truncate text-center text-[11px] text-muted-foreground" title={r.label}>
              {r.date}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--series-1)" }} /> Styrkende
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--series-2)" }} /> Begrænsende
        </span>
      </div>
    </div>
  );
}
