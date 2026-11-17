"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

export function ReportToc({ sections }: { sections: { key: string; title: string; icon: string; count: number }[] }) {
  const [active, setActive] = useState(sections[0]?.key);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.key)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Indhold" className="space-y-0.5">
      <div className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Indhold</div>
      {sections.map((s) => (
        <a
          key={s.key}
          href={`#${s.key}`}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
            active === s.key && "bg-secondary font-semibold text-secondary-foreground",
          )}
        >
          <CategoryIcon name={s.icon} className={cn("size-4 shrink-0", active === s.key && "text-primary")} />
          <span className="truncate">{s.title}</span>
          {s.count > 0 && <span className="ml-auto text-xs tabular-nums opacity-70">{s.count}</span>}
        </a>
      ))}
    </nav>
  );
}
