"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/format";

export function ComparePicker({
  options,
  initial,
}: {
  options: { id: string; title: string; expertName: string | null; date: string }[];
  initial: string[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  return (
    <div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/30 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-secondary/40"
          >
            <Checkbox checked={sel.includes(o.id)} onCheckedChange={() => toggle(o.id)} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{o.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {o.expertName ?? "Ingen ekspert"} · {formatDate(o.date)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={sel.length < 2} onClick={() => router.push(`/compare?ids=${sel.join(",")}`)}>
          <Columns3 /> Sammenlign {sel.length >= 2 ? `(${sel.length})` : ""}
        </Button>
        <span className="text-sm text-muted-foreground">Vælg 2-4 færdige analyser.</span>
      </div>
    </div>
  );
}
