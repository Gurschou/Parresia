import { cn } from "@/lib/utils";

/** Logomærke: en TOTE-løkke (test → operate → test → exit) som to buede pile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--series-7)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lm-g)" />
      <path d="M9.5 16a6.5 6.5 0 0 1 11.6-4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M22.5 16a6.5 6.5 0 0 1-11.6 4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
      <path d="M21.6 8.6l-.3 3.6-3.5-.6" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="16" r="1.6" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className="font-serif text-[17px] font-semibold tracking-tight">Parresia</div>
        <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modeling Studio</div>
      </div>
    </div>
  );
}
