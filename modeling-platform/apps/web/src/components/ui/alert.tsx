import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-xl border px-4 py-3 text-sm flex gap-3 [&>svg]:size-4 [&>svg]:mt-0.5 [&>svg]:shrink-0", {
  variants: {
    tone: {
      info: "border-info/20 bg-info-soft text-foreground [&>svg]:text-info",
      warning: "border-warning/25 bg-warning-soft text-foreground [&>svg]:text-warning",
      negative: "border-negative/25 bg-negative-soft text-foreground [&>svg]:text-negative",
      positive: "border-positive/25 bg-positive-soft text-foreground [&>svg]:text-positive",
      neutral: "bg-muted [&>svg]:text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Alert({ className, tone, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ tone }), className)} {...props} />;
}
