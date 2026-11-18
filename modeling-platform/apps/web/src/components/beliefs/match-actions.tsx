"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, UserCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opdaterer server-komponenten, mens et match kører, og siger til, når det er klart. */
export function AutoRefresh({ active, intervalMs = 2500, doneMessage = "Overbevisnings-matchet er klar" }: { active: boolean; intervalMs?: number; doneMessage?: string }) {
  const router = useRouter();
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) toast.success(doneMessage);
    wasActive.current = active;
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router, doneMessage]);
  return null;
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: body === undefined ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? "Noget gik galt.");
  }
  return res;
}

export function RerunMatchButton({ analysisId, label = "Kør matchet igen", variant = "outline" }: { analysisId: string; label?: string; variant?: "outline" | "default" | "ghost" }) {
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
          await post(`/api/analyses/${analysisId}/matches`);
          toast("Matcher overbevisninger mod hele biblioteket …");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {label}
    </Button>
  );
}

export function BackfillButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await post("/api/beliefs/backfill");
          const { queued } = (await res.json()) as { queued: number };
          toast(`${queued} ${queued === 1 ? "analyse" : "analyser"} sat i kø til match`);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Match {count} {count === 1 ? "analyse" : "analyser"}
    </Button>
  );
}

/** "Det er mig": markerer eksperten som brugeren selv (kun én ad gangen). */
export function SelfToggle({ expertId, isSelf }: { expertId: string; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={isSelf ? "default" : "outline"}
      aria-pressed={isSelf}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post(`/api/experts/${expertId}`, { isSelf: !isSelf });
          toast.success(isSelf ? "Ikke længere markeret som dig" : "Markeret som dig — overbevisnings-match vises nu som “passer til dig”");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : isSelf ? <UserCheck /> : <UserRound />} {isSelf ? "Det er mig" : "Markér som mig"}
    </Button>
  );
}
