"use client";
import { useSyncExternalStore } from "react";

// Whether the manager sidebar shows labels. Remembered in this browser; if storage is blocked it lasts until reload.
const KEY = "kca-manager-sidebar";
const EVENT = "kca-sidebar-change";
let memory: boolean | undefined;
function read() {
  try { const saved = localStorage.getItem(KEY); if (saved) return saved === "open"; } catch { /* storage blocked */ }
  return memory ?? !window.matchMedia("(max-width: 767px)").matches;
}
function subscribe(callback: () => void) {
  const phone = window.matchMedia("(max-width: 767px)");
  phone.addEventListener("change", callback);
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { phone.removeEventListener("change", callback); window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
export function useSidebar() {
  const open = useSyncExternalStore(subscribe, read, () => true);
  const toggle = () => {
    memory = !open;
    try { localStorage.setItem(KEY, memory ? "open" : "closed"); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { open, toggle };
}
