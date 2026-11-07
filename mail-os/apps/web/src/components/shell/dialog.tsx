"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export function ShellDialog({ open, onClose, labelId, className, children, id }: {
  open: boolean; onClose: () => void; labelId: string;
  className?: string; children: React.ReactNode; id?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current!;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      if (!dialog.open) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
      frame = requestAnimationFrame(() => { dialog.dataset.visible = "true"; });
    } else if (dialog.open) {
      dialog.dataset.visible = "false";
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer = setTimeout(() => {
        const restore = dialog.contains(document.activeElement) || document.activeElement === document.body;
        dialog.close();
        if (restore && returnFocus.current?.isConnected) returnFocus.current.focus();
      }, reduced ? 0 : 240);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [open]);
  return (
    <dialog id={id} ref={ref} aria-labelledby={labelId} className={cn("signal-dialog", className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="signal-dialog-panel">{children}</div>
    </dialog>
  );
}
