"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastOptions = { durationMs?: number; action?: { label: string; onAction: () => void } };
const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<ToastOptions["action"]>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((text: string, options?: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    setAction(options?.action);
    timer.current = setTimeout(() => { setMessage(""); setAction(undefined); }, options?.durationMs ?? (options?.action ? 5000 : 3000));
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const activate = useCallback(() => {
    action?.onAction();
    if (timer.current) clearTimeout(timer.current);
    setMessage(""); setAction(undefined);
  }, [action]);
  useEffect(() => {
    if (!action || action.label !== "Undo") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "z" || event.ctrlKey || event.metaKey || event.altKey || target?.closest?.("input, textarea, [contenteditable], dialog[open], [role=dialog]")) return;
      event.preventDefault(); activate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, activate]);
  return (
    <ToastContext value={toast}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="signal-toast"
        data-visible={!!message} data-action={!!action}>{message}{action && <button type="button" onClick={activate}>{action.label}</button>}</div>
    </ToastContext>
  );
}
