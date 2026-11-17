"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function DashboardFilters({ experts, projects }: { experts: { id: string; name: string }[]; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === ALL) p.delete(k);
    else p.set(k, v);
    router.push(`/dashboard?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap gap-3">
      <Select value={params.get("projectId") ?? ALL} onValueChange={(v) => set("projectId", v)}>
        <SelectTrigger className="w-48" aria-label="Projekt">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle projekter</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("expertId") ?? ALL} onValueChange={(v) => set("expertId", v)}>
        <SelectTrigger className="w-52" aria-label="Ekspert">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle eksperter</SelectItem>
          {experts.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
