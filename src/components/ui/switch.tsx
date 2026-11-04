"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root data-slot="switch" className={cn("ns-switch", className)} {...props}><SwitchPrimitive.Thumb className="ns-switch-thumb" /></SwitchPrimitive.Root>;
}
