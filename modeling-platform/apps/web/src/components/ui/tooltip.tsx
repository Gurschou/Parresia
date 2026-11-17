"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;
export const Tooltip = T.Root;
export const TooltipTrigger = T.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof T.Content>) {
  return (
    <T.Portal>
      <T.Content
        sideOffset={sideOffset}
        className={cn("z-50 max-w-xs rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95", className)}
        {...props}
      />
    </T.Portal>
  );
}
