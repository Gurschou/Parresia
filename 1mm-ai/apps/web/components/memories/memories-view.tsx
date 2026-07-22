"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { MemoryCategory } from "@1mm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

interface MemoryDto {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: "Præference",
  project: "Projekt",
  goal: "Mål",
  work_method: "Arbejdsmetode",
  fact: "Fakta",
  other: "Andet",
};

export function MemoriesView() {
  const [memories, setMemories] = useState<MemoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [memoriesRes, prefsRes] = await Promise.all([
        fetch("/api/memories"),
        fetch("/api/preferences"),
      ]);
      if (memoriesRes.ok) {
        const body = (await memoriesRes.json()) as { memories: MemoryDto[] };
        setMemories(body.memories);
      }
      if (prefsRes.ok) {
        const body = (await prefsRes.json()) as {
          preferences: { autoMemoryEnabled: boolean };
        };
        setAutoMemory(body.preferences.autoMemoryEnabled);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleAutoMemory() {
    const next = !autoMemory;
    setAutoMemory(next);
    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoMemoryEnabled: next }),
    });
  }

  async function addMemory(e: FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setError(null);
    const response = await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory, content: newContent.trim() }),
    });
    if (!response.ok) {
      setError("Kunne ikke gemme. Prøv igen.");
      return;
    }
    setNewContent("");
    await load();
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await fetch(`/api/memories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editText.trim() }),
    });
    setEditingId(null);
    await load();
  }

  async function deleteMemory(id: string) {
    await fetch(`/api/memories/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function forgetAll() {
    if (!window.confirm("Slet alle gemte minder permanent?")) return;
    await fetch("/api/memories", { method: "DELETE" });
    setMemories([]);
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 pt-16 md:p-8 md:pt-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">Hukommelse</h1>
        <p className="mt-1 text-sm text-text-secondary">
          1MM AI kan huske relevante oplysninger på tværs af samtaler. Du bestemmer, hvad der
          gemmes.
        </p>

        <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="text-sm font-medium">Automatisk hukommelse</p>
            <p className="text-xs text-text-secondary">
              Lad 1MM AI selv gemme vigtige oplysninger fra samtaler.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoMemory}
            aria-label="Automatisk hukommelse"
            onClick={toggleAutoMemory}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              autoMemory ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                autoMemory ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <form onSubmit={addMemory} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="new-memory" className="sr-only">
            Ny memory
          </label>
          <Input
            id="new-memory"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Tilføj noget, 1MM AI skal huske…"
            maxLength={1000}
          />
          <div className="flex gap-2">
            <label htmlFor="new-memory-category" className="sr-only">
              Kategori
            </label>
            <select
              id="new-memory-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              className="h-10 rounded-lg border border-border bg-surface px-2 text-sm"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={!newContent.trim()}>
              <Plus className="h-4 w-4" aria-hidden />
              Tilføj
            </Button>
          </div>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6">
          {loading ? (
            <ul className="space-y-2" aria-hidden>
              {[1, 2, 3].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
              ))}
            </ul>
          ) : memories.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
              Ingen gemte minder endnu.
            </p>
          ) : (
            <ul className="space-y-2">
              {memories.map((memory) => (
                <li
                  key={memory.id}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  {editingId === memory.id ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`edit-${memory.id}`} className="sr-only">
                        Redigér memory
                      </label>
                      <Input
                        id={`edit-${memory.id}`}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={1000}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void saveEdit(memory.id)}>
                          Gem
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Annullér
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">{memory.content}</p>
                        <p className="mt-1 text-xs text-text-muted">
                          {CATEGORY_LABELS[memory.category]} · Oprettet{" "}
                          {formatDate(memory.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(memory.id);
                            setEditText(memory.content);
                          }}
                          aria-label="Redigér memory"
                          className="rounded-lg p-2 text-text-muted hover:bg-surface-raised hover:text-text-primary"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteMemory(memory.id)}
                          aria-label="Slet memory"
                          className="rounded-lg p-2 text-text-muted hover:bg-surface-raised hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {memories.length > 0 && (
          <div className="mt-6">
            <Button variant="danger" onClick={forgetAll}>
              Glem alt
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
