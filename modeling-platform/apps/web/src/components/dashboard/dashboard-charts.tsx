"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.25)",
};

/** Overbevisninger pr. session over tid (grupperede søjler). */
export function BeliefsOverTime({ data }: { data: { date: string; label: string; enabling: number; disenabling: number }[] }) {
  const rows = data.map((d) => ({ ...d, x: new Date(d.date).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="x" tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-axis)" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="enabling" name="Styrkende" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="disenabling" name="Begrænsende" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Divergerende søjler: −100 (pol A) … +100 (pol B) for hvert meta-program. */
export function MetaProgramDiverging({
  rows,
}: {
  rows: { program: string; name: string; poles: readonly [string, string]; pole_a: number; pole_b: number; balanced: number; tendency: number }[];
}) {
  const short = (p: string) => p.replace(/\s*\(.*\)\s*$/, "");
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const w = Math.min(50, Math.abs(r.tendency) / 2);
        return (
          <div key={r.program}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold">{r.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {r.pole_a} · {r.balanced} · {r.pole_b}
              </span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,2fr)_minmax(0,1fr)] items-center gap-2 text-[11px]">
              <span className={r.tendency < -5 ? "truncate text-right font-semibold" : "truncate text-right text-muted-foreground"}>{short(r.poles[0])}</span>
              <Tip>
                <TooltipTrigger asChild>
                  <div className="relative h-3 rounded-full bg-muted">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-chart-axis" style={{ background: "var(--chart-axis)" }} />
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: "var(--series-1)",
                        width: `${w}%`,
                        left: r.tendency < 0 ? `${50 - w}%` : "50%",
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {short(r.poles[0])}: {r.pole_a} · balanceret: {r.balanced} · {short(r.poles[1])}: {r.pole_b} — tendens {Math.round(r.tendency)}
                </TooltipContent>
              </Tip>
              <span className={r.tendency > 5 ? "truncate font-semibold" : "truncate text-muted-foreground"}>{short(r.poles[1])}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Vandrette søjler med direkte labels (fx top-værdier, strategityper). */
export function HBarList({ items, unit = "", max }: { items: { label: string; value: number; hint?: string }[]; unit?: string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={it.label}>
            {it.label}
          </span>
          <Tip>
            <TooltipTrigger asChild>
              <span className="h-2.5 rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${(it.value / m) * 100}%`, background: "var(--series-1)" }} />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {it.label}: {it.value}
              {unit} {it.hint ? `· ${it.hint}` : ""}
            </TooltipContent>
          </Tip>
          <span className="w-12 text-right tabular-nums text-muted-foreground">
            {it.value}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}
