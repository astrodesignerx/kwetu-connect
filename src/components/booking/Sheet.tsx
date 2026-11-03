"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

export default function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let cancelled = false;
    let exitAnimation: Animation | undefined;
    if (open) {
      delete dialog.dataset.closing;
      if (!dialog.open) dialog.showModal();
      else if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (dialog.open) {
      dialog.dataset.closing = "true";
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) dialog.close();
      else {
        const tokens = getComputedStyle(dialog);
        exitAnimation = dialog.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(8px)" }], {
          duration: parseFloat(tokens.getPropertyValue("--duration-surface")), easing: tokens.getPropertyValue("--ease-standard").trim(),
        });
        exitAnimation.finished.then(() => { if (!cancelled) dialog.close(); }).catch(() => undefined);
      }
    }
    return () => { cancelled = true; exitAnimation?.cancel(); };
  }, [open, title]);
  return <dialog ref={ref} className="timetable-sheet" aria-labelledby={id} data-lenis-prevent
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="sheet-heading"><h2 id={id}>{title}</h2><button type="button" className="quiet-button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>Close</button></div>
    <div className="sheet-content" key={title}>{children}</div>
  </dialog>;
}
