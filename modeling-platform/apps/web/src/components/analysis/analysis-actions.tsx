"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Braces, Columns3, Download, FileDown, FileText, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AnalysisActions({ id, title, completed }: { id: string; title: string; completed: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success("Analysen er slettet");
      router.push("/analyses");
      router.refresh();
    } else toast.error("Kunne ikke slette analysen");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {completed && (
        <>
          <Button asChild>
            <a href={`/api/analyses/${id}/report?format=pdf`} download>
              <FileDown /> PDF-rapport
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download /> Eksportér
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={`/api/analyses/${id}/report?format=md`} download>
                  <FileText /> Markdown (.md)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/analyses/${id}/report?format=json`} download>
                  <Braces /> JSON (struktureret)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/analyses/${id}/report?format=pdf`} download>
                  <FileDown /> PDF
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Flere handlinger">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {completed && (
            <DropdownMenuItem asChild>
              <Link href={`/compare?ids=${id}`}>
                <Columns3 /> Sammenlign med andre
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 /> Slet analyse
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slet analysen?</DialogTitle>
            <DialogDescription>“{title}” og eventuelle eksempler i mønsterbiblioteket slettes permanent.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Annullér
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" />} Slet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
