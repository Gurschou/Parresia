import {
  CircleHelp,
  Eye,
  HeartPulse,
  MessageSquareQuote,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  workflow: Workflow,
  "shield-check": ShieldCheck,
  "shield-alert": ShieldAlert,
  "heart-pulse": HeartPulse,
  "sliders-horizontal": SlidersHorizontal,
  "message-square-quote": MessageSquareQuote,
  eye: Eye,
  "scan-eye": ScanEye,
  "circle-help": CircleHelp,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} />;
}

/** Repræsentationssystem → diagramfarve (fast rækkefølge: V, A, K, O, G, Ad). */
export const REP_COLOR: Record<string, string> = {
  V: "var(--series-1)",
  A: "var(--series-2)",
  K: "var(--series-3)",
  O: "var(--series-4)",
  G: "var(--series-5)",
  Ad: "var(--series-6)",
};

export function repColorForLabel(label: string): string {
  if (label.startsWith("Ad")) return REP_COLOR.Ad!;
  return REP_COLOR[label[0] ?? ""] ?? "var(--muted-foreground)";
}
