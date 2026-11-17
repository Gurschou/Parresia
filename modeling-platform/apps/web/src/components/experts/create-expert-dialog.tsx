"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "__none__";

export function CreateExpertDialog({
  trigger,
  projects,
  onCreated,
}: {
  trigger: React.ReactNode;
  projects: { id: string; name: string }[];
  onCreated?: (e: { id: string; name: string; role: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [projectId, setProjectId] = useState(NONE);

  async function submit(form: FormData) {
    setPending(true);
    try {
      const res = await fetch("/api/experts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          role: form.get("role"),
          description: form.get("description"),
          projectId: projectId === NONE ? null : projectId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.details?.[0]?.message ?? body?.error?.message ?? "Kunne ikke oprette eksperten");
      toast.success(`${body.name} er oprettet`);
      onCreated?.(body);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fejl");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny model / ekspert</DialogTitle>
          <DialogDescription>Personen, du modellerer. Analyser kan knyttes til eksperten og sammenlignes over tid.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exp-name">Navn</Label>
            <Input id="exp-name" name="name" required autoFocus placeholder="Fx Mette Holm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-role">Rolle / domæne</Label>
            <Input id="exp-role" name="role" placeholder="Fx salgsdirektør" />
          </div>
          {projects.length > 0 && (
            <div className="space-y-2">
              <Label>Projekt</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Intet projekt</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="exp-desc">Beskrivelse</Label>
            <Textarea id="exp-desc" name="description" className="min-h-20" placeholder="Hvorfor er personen værd at modellere?" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annullér
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Opret ekspert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
