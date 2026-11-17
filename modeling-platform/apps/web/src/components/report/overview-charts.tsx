"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { REP_COLOR } from "./category-icon";

const REP_ORDER = ["V", "A", "K", "O", "G", "Ad"] as const;
type Rep = (typeof REP_ORDER)[number];

export const REP_LABEL: Record<Rep, string> = {
  V: "Visuelt",
  A: "Auditivt",
  K: "Kinæstetisk",
  O: "Olfaktorisk",
  G: "Gustatorisk",
  Ad: "Aud. digitalt",
};

/** Én 100 %-stablet bjælke pr. fordeling, med 2px mellemrum og hover-tooltip. */
export function DistributionBar({
  distribution,
  label,
  highlight,
  size = "md",
}: {
  distribution: Record<string, number>;
  label?: string;
  highlight?: string;
  size?: "sm" | "md";
}) {
  const total = REP_ORDER.reduce((a, s) => a + (distribution[s] ?? 0), 0) || 1;
  return (
    <div>
      {label && <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</div>}
      <div className={cn("flex w-full gap-[2px] overflow-hidden rounded-full bg-muted", size === "md" ? "h-4" : "h-2.5")}>
        {REP_ORDER.filter((s) => (distribution[s] ?? 0) > 0).map((s) => (
          <Tooltip key={s}>
            <TooltipTrigger asChild>
              <span
                className={cn("h-full transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-110", highlight && highlight !== s && "opacity-70")}
                style={{ width: `${((distribution[s] ?? 0) / total) * 100}%`, background: REP_COLOR[s] }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-semibold">{REP_LABEL[s]} ({s})</span> · {(distribution[s] ?? 0).toLocaleString("da-DK", { maximumFractionDigits: 1 })} %
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export function VakogLegend({ distribution, primary }: { distribution: Record<string, number>; primary?: string }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
      {REP_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: REP_COLOR[s] }} />
          <span className={cn("truncate", s === primary ? "font-semibold" : "text-muted-foreground")}>{REP_LABEL[s]}</span>
          <span className="ml-auto tabular-nums text-muted-foreground">{Math.round(distribution[s] ?? 0)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function NeedsRadar({
  data,
  series,
  height = 260,
}: {
  /** [{ need: "Sikkerhed", s0: 7, s1: 5 }] */
  data: Record<string, string | number>[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="need" tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 600 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} tickCount={6} />
          {series.map((s) => (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={series.length > 1 ? 0.08 : 0.18}
              dot={{ r: 3.5, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive
            />
          ))}
          <RTooltip
            cursor={false}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--foreground)",
              boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.25)",
            }}
            formatter={(v, name) => [`${v} / 10`, name]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

const shortPole = (p: string) => p.replace(/\s*\(.*\)\s*$/, "");

/** Bipolær skala: pol A ← → pol B, markør placeret efter retning og styrke. */
export function MetaProgramScale({
  name,
  poles,
  leaning,
  strength,
}: {
  name: string;
  poles: readonly [string, string];
  leaning: "pole_a" | "pole_b" | "balanced";
  strength: number;
}) {
  const pos = leaning === "balanced" ? 50 : leaning === "pole_a" ? 50 - strength / 2 : 50 + strength / 2;
  const active = leaning === "balanced" ? "Balanceret" : shortPole(leaning === "pole_a" ? poles[0] : poles[1]);
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{name}</span>
        <span className="truncate text-xs font-bold">{active}</span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-muted via-border to-muted">
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-muted-foreground/40" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-md"
              style={{ left: `${Math.max(4, Math.min(96, pos))}%` }}
            />
          </TooltipTrigger>
          <TooltipContent>
            {active} · styrke {Math.round(strength)}/100
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[10.5px] text-muted-foreground">
        <span className={cn("truncate", leaning === "pole_a" && "font-semibold text-foreground")}>{shortPole(poles[0])}</span>
        <span className={cn("truncate text-right", leaning === "pole_b" && "font-semibold text-foreground")}>{shortPole(poles[1])}</span>
      </div>
    </div>
  );
}
