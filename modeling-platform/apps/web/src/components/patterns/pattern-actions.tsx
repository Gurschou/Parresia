"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookmarkPlus, Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeletePatternButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Slet mønster"
      disabled={pending}
      onClick={async () => {
        if (!confirm("Slet mønstret fra biblioteket?")) return;
        setPending(true);
        const res = await fetch(`/api/patterns/${id}`, { method: "DELETE" });
        setPending(false);
        if (res.ok) router.refresh();
        else toast.error("Kunne ikke slette mønstret");
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export function RemoveExampleButton({ patternId, exampleId }: { patternId: string; exampleId: string }) {
  const router = useRouter();
  return (
    <button
      className="rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
      aria-label="Fjern eksempel"
      onClick={async () => {
        const res = await fetch(`/api/patterns/${patternId}/examples?exampleId=${exampleId}`, { method: "DELETE" });
        if (res.ok) router.refresh();
      }}
    >
      <X className="size-3.5" />
    </button>
  );
}

export function SaveSuggestionButton({
  suggestion,
  saved,
}: {
  suggestion: {
    title: string;
    category: string;
    description: string;
    occurrences: { analysisId: string; label: string; quote?: string }[];
  };
  saved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(saved);
  if (done) {
    return (
      <Button variant="secondary" size="sm" disabled>
        <Check /> I biblioteket
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/patterns", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: suggestion.title.slice(0, 200),
            category: suggestion.category,
            description: suggestion.description,
            tags: ["auto"],
            examples: suggestion.occurrences.map((o) => ({
              analysisId: o.analysisId,
              excerpt: { label: o.label, quotes: o.quote ? [o.quote] : [] },
            })),
          }),
        });
        setPending(false);
        if (res.ok) {
          setDone(true);
          toast.success("Mønstret er gemt i biblioteket");
          router.refresh();
        } else toast.error((await res.json())?.error?.message ?? "Kunne ikke gemme");
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Gem i bibliotek
    </Button>
  );
}
