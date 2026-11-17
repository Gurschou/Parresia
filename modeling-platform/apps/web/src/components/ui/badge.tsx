import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
        primary: "bg-secondary text-secondary-foreground",
        positive: "bg-positive-soft text-positive",
        negative: "bg-negative-soft text-negative",
        info: "bg-info-soft text-info",
        warning: "bg-warning-soft text-warning",
        outline: "ring-1 ring-inset ring-border text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
