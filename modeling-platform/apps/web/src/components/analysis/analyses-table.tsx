"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioLines, Columns3, FileText, Type, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { formatDate, relativeTime } from "@/lib/format";
import type { AnalysisStatus, SourceType } from "@/db/schema";

const ALL = "__all__";
const SOURCE_ICON: Record<SourceType, React.ComponentType<{ className?: string }>> = { text: Type, file: FileText, audio: AudioLines, video: Video };

export interface Row {
  id: string;
  title: string;
  status: AnalysisStatus;
  sourceType: SourceType;
  expertName: string | null;
  projectName: string | null;
  sessionDate: string | null;
  createdAt: string;
}

export function AnalysesTable({ rows, experts, projects }: { rows: Row[]; experts: { id: string; name: string }[]; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);

  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value === ALL) p.delete(key);
    else p.set(key, value);
    router.push(`/analyses?${p.toString()}`);
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={params.get("expertId") ?? ALL} onValueChange={(v) => setFilter("expertId", v)}>
          <SelectTrigger className="w-52" aria-label="Filtrér på ekspert">
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
        <Select value={params.get("projectId") ?? ALL} onValueChange={(v) => setFilter("projectId", v)}>
          <SelectTrigger className="w-48" aria-label="Filtrér på projekt">
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
        <Select value={params.get("status") ?? ALL} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-40" aria-label="Filtrér på status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle statusser</SelectItem>
            <SelectItem value="completed">Færdige</SelectItem>
            <SelectItem value="analyzing">Analyserer</SelectItem>
            <SelectItem value="failed">Fejlede</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          {selected.length > 0 && <span className="text-sm text-muted-foreground">{selected.length} valgt (maks. 4)</span>}
          <Button disabled={selected.length < 2} onClick={() => router.push(`/compare?ids=${selected.join(",")}`)}>
            <Columns3 /> Sammenlign
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead>Analyse</TableHead>
              <TableHead>Ekspert</TableHead>
              <TableHead className="hidden md:table-cell">Projekt</TableHead>
              <TableHead className="hidden sm:table-cell">Dato</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const Icon = SOURCE_ICON[r.sourceType];
              return (
                <TableRow key={r.id} data-state={selected.includes(r.id) ? "selected" : undefined} className="data-[state=selected]:bg-secondary/50">
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      disabled={r.status !== "completed"}
                      aria-label={`Vælg ${r.title}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/analyses/${r.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <span className="line-clamp-1">{r.title}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.expertName ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{r.projectName ?? "—"}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell" title={formatDate(r.createdAt)}>
                    {r.sessionDate ? formatDate(r.sessionDate) : relativeTime(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
