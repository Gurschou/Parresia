"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, AudioLines, Brain, Check, FileCheck2, Loader2, RotateCcw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Status {
  status: "queued" | "transcribing" | "analyzing" | "completed" | "failed";
  progress: number;
  stageMessage: string;
  errorMessage: string | null;
  errorCode: string | null;
}

const STEPS = [
  { key: "queued", label: "I kø", icon: ScrollText },
  { key: "transcribing", label: "Transskribering", icon: AudioLines },
  { key: "analyzing", label: "Claude analyserer", icon: Brain },
  { key: "completed", label: "Rapport klar", icon: FileCheck2 },
] as const;

export function AnalysisProgress({ id, initial, hasMedia }: { id: string; initial: Status; hasMedia: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<Status>(initial);
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const started = useRef(Date.now());
  const notified = useRef(false);

  useEffect(() => {
    if (s.status === "completed" || s.status === "failed") return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/analyses/${id}/status`, { cache: "no-store" });
        if (res.ok && alive) {
          const next = (await res.json()) as Status;
          setS(next);
          if (next.status === "completed" && !notified.current) {
            notified.current = true;
            toast.success("Analysen er færdig");
            router.refresh();
          }
        }
      } catch {
        /* prøv igen ved næste tick */
      }
    };
    const poll = setInterval(tick, 1200);
    const clock = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [id, s.status, router]);

  const steps = STEPS.filter((st) => st.key !== "transcribing" || hasMedia);
  const idx = steps.findIndex((st) => st.key === s.status);

  async function retry() {
    setRetrying(true);
    const res = await fetch(`/api/analyses/${id}/retry`, { method: "POST" });
    setRetrying(false);
    if (res.ok) {
      started.current = Date.now();
      setS({ status: "queued", progress: 0, stageMessage: "I kø", errorMessage: null, errorCode: null });
    } else toast.error((await res.json())?.error?.message ?? "Kunne ikke starte igen");
  }

  if (s.status === "failed") {
    return (
      <Card className="mx-auto max-w-2xl border-negative/30 p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-negative-soft">
          <AlertTriangle className="size-6 text-negative" />
        </div>
        <h2 className="text-2xl">Analysen fejlede</h2>
        <p className="mx-auto mt-3 max-w-lg text-muted-foreground text-pretty">{s.errorMessage ?? "Ukendt fejl."}</p>
        {s.errorCode && <p className="mt-2 font-mono text-xs text-muted-foreground">kode: {s.errorCode}</p>}
        <Button className="mt-6" onClick={retry} disabled={retrying}>
          {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />} Prøv igen
        </Button>
      </Card>
    );
  }

  return (
    <Card className="relative mx-auto max-w-3xl overflow-hidden p-8 sm:p-10">
      <div className="absolute inset-x-0 top-0 h-1 shimmer" />
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Analyserer</div>
          <h2 className="mt-1 text-2xl">{s.stageMessage || "Arbejder…"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Du kan roligt forlade siden — analysen fortsætter i baggrunden. ({Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")})
          </p>
        </div>
        <span className="text-4xl font-bold tabular-nums tracking-[-0.03em] text-primary">{s.progress}%</span>
      </div>
      <Progress value={s.progress} className="h-2.5" />
      <ol className="mt-8 grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((st, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <li key={st.key} className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-2xl border transition",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary bg-secondary text-primary shadow-[0_0_0_6px] shadow-primary/10",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-5" /> : current ? <st.icon className="size-5 animate-pulse" /> : <st.icon className="size-5" />}
              </span>
              <span className={cn("text-xs font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{st.label}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
