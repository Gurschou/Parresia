import { cn } from "@/lib/utils";

/** Mærket: en iris med de seks eye accessing-positioner, farvet efter sansesystem (V, A, K, Ad). */
export function LogoMark({ className }: { className?: string }) {
  const pts: [number, number, number][] = [
    [6, 7, 1],
    [18, 7, 1],
    [3.6, 12, 2],
    [20.4, 12, 2],
    [6, 17, 3],
    [18, 17, 6],
  ];
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-border", className)}>
      <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="1.7" fill="currentColor" />
        {pts.map(([x, y, slot], i) => (
          <circle key={i} cx={x} cy={y} r="1.25" fill={`var(--series-${slot})`} />
        ))}
      </svg>
    </span>
  );
}

/** Logo til mørk baggrund (navigationen). `tone="ink"` bruges på lys baggrund. */
export function Logo({ className, tone = "rail" }: { className?: string; tone?: "rail" | "ink" }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className={cn("text-[17px] font-extrabold tracking-[-0.02em]", tone === "rail" ? "text-sidebar-foreground" : "text-foreground")}>Parresia</div>
        <div className={cn("mt-1 text-[10.5px] font-semibold uppercase tracking-[0.2em]", tone === "rail" ? "text-sidebar-muted" : "text-muted-foreground")}>Modeling Studio</div>
      </div>
    </div>
  );
}
