import { AudioLines, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AnalysisStatus } from "@/db/schema";

const MAP: Record<AnalysisStatus, { label: string; tone: "neutral" | "info" | "positive" | "negative" | "primary"; icon: React.ComponentType<{ className?: string }>; spin?: boolean }> = {
  queued: { label: "I kø", tone: "neutral", icon: CircleDashed },
  transcribing: { label: "Transskriberer", tone: "info", icon: AudioLines },
  analyzing: { label: "Analyserer", tone: "primary", icon: Loader2, spin: true },
  completed: { label: "Færdig", tone: "positive", icon: CheckCircle2 },
  failed: { label: "Fejlet", tone: "negative", icon: XCircle },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const m = MAP[status];
  return (
    <Badge tone={m.tone}>
      <m.icon className={m.spin ? "animate-spin" : undefined} /> {m.label}
    </Badge>
  );
}
