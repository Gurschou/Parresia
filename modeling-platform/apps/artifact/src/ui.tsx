import * as React from "react";
import { X } from "lucide-react";
import { cn } from "./lib";

type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "accent" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  outline: "border bg-card hover:bg-muted",
  ghost: "hover:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  accent: "bg-accent text-accent-foreground hover:opacity-90",
  destructive: "bg-destructive text-white hover:opacity-90",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
  icon: "size-9 rounded-lg",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-semibold whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({ href, variant = "default", size = "md", className, children }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition active:scale-[0.98] [&_svg]:size-4",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {children}
    </a>
  );
}

export type BadgeTone = "neutral" | "primary" | "positive" | "negative" | "info" | "warning" | "outline";
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-[var(--border)]",
  primary: "bg-secondary text-secondary-foreground",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  outline: "ring-1 ring-inset ring-[var(--border)] text-foreground",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] leading-5 font-semibold whitespace-nowrap [&_svg]:size-3", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card min-w-0", className)} {...rest}>
      {children}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full min-w-0 rounded-lg border bg-card px-3 py-2 text-sm shadow-xs transition placeholder:text-muted-foreground/70 focus:border-[var(--ring)] focus:ring-[3px] focus:ring-[color-mix(in_oklch,var(--ring)_25%,transparent)]";

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="card animate-in relative w-full max-w-lg p-6">
        <button onClick={onClose} className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Luk">
          <X className="size-4" />
        </button>
        <h2 className="pr-8 text-xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3 text-primary">{eyebrow}</div>}
        <h1 className="text-3xl leading-[1.05] sm:text-[2.6rem]">{title}</h1>
        {description && <p className="text-pretty mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="text-xl">{title}</h3>
      {description && <p className="text-pretty mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Lille statusbesked (toast) nederst til højre. */
export function useToast() {
  const [msg, setMsg] = React.useState<{ text: string; tone: "positive" | "negative" | "info" } | null>(null);
  React.useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3800);
    return () => window.clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div
      role="status"
      className={cn(
        "card animate-in fixed z-50 max-w-sm px-4 py-3 text-sm font-medium",
        msg.tone === "positive" && "border-[color-mix(in_oklch,var(--positive)_35%,transparent)]",
        msg.tone === "negative" && "border-[color-mix(in_oklch,var(--negative)_35%,transparent)]",
      )}
      style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
    >
      {msg.text}
    </div>
  ) : null;
  return { toast: (text: string, tone: "positive" | "negative" | "info" = "info") => setMsg({ text, tone }), node };
}
