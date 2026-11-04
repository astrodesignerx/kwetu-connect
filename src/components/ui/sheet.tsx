"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./button";
export function Sheet({ open, onClose, title, children, variant = "sheet" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; variant?: "sheet" | "dialog" }) {
  return <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="ns-sheet-overlay" /><DialogPrimitive.Content className={variant === "dialog" ? "timetable-sheet ns-dialog" : "timetable-sheet"} aria-describedby={undefined} data-lenis-prevent><div className="sheet-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close asChild><Button variant="ghost" aria-label={"Close " + title.toLowerCase()}>Close</Button></DialogPrimitive.Close></div><div className="sheet-content" key={title}>{children}</div></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
