"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ProjectsPanel({ projects }: { projects: { id: string; name: string; analysisCount: number }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    setPending(false);
    if (res.ok) {
      setName("");
      toast.success("Projekt oprettet");
      router.refresh();
    } else toast.error("Kunne ikke oprette projektet");
  }

  async function remove(id: string) {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else toast.error("Kunne ikke slette projektet");
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-sans text-sm font-bold">
        <FolderKanban className="size-4 text-primary" /> Projekter
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Gruppér eksperter og analyser, fx pr. klient eller kompetence.</p>
      <ul className="mt-4 space-y-1">
        {projects.map((p) => (
          <li key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
            <span className="flex-1 truncate font-medium">{p.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{p.analysisCount}</span>
            <button
              onClick={() => remove(p.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
              aria-label={`Slet ${p.name}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {projects.length === 0 && <li className="px-2 text-sm text-muted-foreground">Ingen projekter endnu.</li>}
      </ul>
      <form onSubmit={create} className="mt-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nyt projekt" className="h-9" aria-label="Projektnavn" />
        <Button size="icon" type="submit" disabled={pending || !name.trim()} aria-label="Opret projekt">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </form>
    </Card>
  );
}
