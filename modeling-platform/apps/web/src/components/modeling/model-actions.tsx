"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fingerprint, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

async function post(url: string) {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? "Noget gik galt.");
  }
  return res;
}

/** Modellér personen (igen) ud fra alle samtalerne. */
export function RerunModelButton({
  analysisId,
  label = "Modellér igen",
  variant = "outline",
  fresh = false,
}: {
  analysisId: string;
  label?: string;
  variant?: "outline" | "default" | "ghost";
  fresh?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post(`/api/analyses/${analysisId}/model`);
          toast("Modellerer personen ud fra alle samtalerne …");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : fresh ? <Fingerprint /> : <RefreshCw />} {label}
    </Button>
  );
}

export function ModelBackfillButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await post("/api/modeling/backfill");
          const { queued } = (await res.json()) as { queued: number };
          toast(queued ? `${queued} ${queued === 1 ? "person" : "personer"} sat i kø til modellering` : "Alle personer har allerede et kort");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Fingerprint />} Modellér {count} {count === 1 ? "person" : "personer"}
    </Button>
  );
}
