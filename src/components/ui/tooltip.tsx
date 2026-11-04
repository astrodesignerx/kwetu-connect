"use client";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return <TooltipPrimitive.Provider delayDuration={200}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content className="ns-tooltip" side="right" sideOffset={8}>{label}<TooltipPrimitive.Arrow /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>;
}
