"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DeleteExpertButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    setPending(true);
    const res = await fetch(`/api/experts/${id}`, { method: "DELETE" });
    setPending(false);
    if (res.ok) {
      toast.success(`${name} er slettet`);
      router.push("/experts");
      router.refresh();
    } else toast.error("Kunne ikke slette eksperten");
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Slet ekspert">
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Slet {name}?</DialogTitle>
          <DialogDescription>Analyserne bevares, men mister tilknytningen til eksperten.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Slet ekspert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
