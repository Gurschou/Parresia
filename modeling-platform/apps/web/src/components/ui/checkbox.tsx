"use client";
import * as React from "react";
import { Checkbox as C } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "peer size-[18px] shrink-0 rounded-[5px] border border-input bg-card shadow-xs outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <C.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}
