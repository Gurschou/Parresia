"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NEW = "__new__";

interface Excerpt {
  label: string;
  detail?: string;
  quotes?: string[];
}

/** Gemmer et fund fra en rapport i mønsterbiblioteket (nyt mønster eller eksisterende). */
export function SavePatternButton({
  analysisId,
  category,
  categoryTitle,
  excerpt,
}: {
  analysisId: string;
  category: string;
  categoryTitle: string;
  excerpt: Excerpt;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [existing, setExisting] = useState<{ id: string; title: string }[]>([]);
  const [target, setTarget] = useState(NEW);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/patterns?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((b) => setExisting((b.items ?? []).map((p: { id: string; title: string }) => ({ id: p.id, title: p.title }))))
      .catch(() => {});
  }, [open, category]);

  async function submit(form: FormData) {
    setPending(true);
    try {
      const res =
        target === NEW
          ? await fetch("/api/patterns", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: form.get("title"),
                category,
                description: form.get("description"),
                tags: String(form.get("tags") ?? "")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                examples: [{ analysisId, excerpt }],
              }),
            })
          : await fetch(`/api/patterns/${target}/examples`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ analysisId, excerpt }),
            });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Kunne ikke gemme");
      toast.success("Gemt i mønsterbiblioteket");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fejl");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              className="-m-1 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Gem i mønsterbibliotek"
            >
              <BookmarkPlus className="size-4" />
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Gem i mønsterbibliotek</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gem i mønsterbibliotek</DialogTitle>
          <DialogDescription>
            {categoryTitle} · “{excerpt.label.length > 90 ? `${excerpt.label.slice(0, 90)}…` : excerpt.label}”
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mønster</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>+ Nyt mønster</SelectItem>
                {existing.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {target === NEW && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pt-title">Titel</Label>
                <Input id="pt-title" name="title" required defaultValue={excerpt.label.slice(0, 120)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-desc">Beskrivelse</Label>
                <Textarea id="pt-desc" name="description" className="min-h-20" defaultValue={excerpt.detail ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pt-tags">Tags</Label>
                <Input id="pt-tags" name="tags" placeholder="salg, forberedelse, beslutning" />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annullér
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Gem
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
