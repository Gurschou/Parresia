import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 lg:py-10", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold leading-tight text-balance sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground text-pretty">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
