"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Anchored popover surfaces — the avatar menu, the contact card.
 *
 * Two things every one of them needs and none of them should re-implement:
 * dismissal (pointer outside, or Escape) and an exit that animates instead of
 * cutting. A plain `{open && <div/>}` unmounts the moment state flips, so the
 * surface vanishes mid-transition; this keeps it mounted for the length of the
 * closing animation and marks it with `data-closing` so the CSS can play the
 * entrance in reverse.
 */

/**
 * Attach to the element wrapping *both* the trigger and the popover. Wrapping
 * only the popover would make the trigger an "outside" click, so the same tap
 * that opens the menu would immediately close it again.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase: the mail view has a window-level Escape handler that clears
    // the thread selection. Whatever is on top should consume the key first.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onDismiss]);

  return ref;
}

export function Popover({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  /**
   * Three phases rather than a boolean, adjusted during render when `open`
   * changes — the sanctioned way to react to a changed prop. Doing it in an
   * effect would schedule a second render pass after every open and close, and
   * the closing frame would paint before the state that describes it.
   *
   * Unmounting waits for `animationend` rather than a matching timeout, so the
   * two can never drift apart when the duration token changes — and reduced
   * motion, which collapses the animation to nothing, still fires the event.
   */
  const [phase, setPhase] = useState<"open" | "closing" | "closed">(
    open ? "open" : "closed"
  );
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    setPhase(open ? "open" : "closing");
  }

  if (phase === "closed") return null;

  return (
    <div
      role="dialog"
      data-closing={phase === "closing" || undefined}
      onAnimationEnd={() => {
        if (phase === "closing") setPhase("closed");
      }}
      className={cn("menu-pop absolute", className)}
    >
      {children}
    </div>
  );
}
