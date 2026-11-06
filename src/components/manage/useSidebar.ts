"use client";
import { useSyncExternalStore } from "react";

// Whether the manager sidebar shows labels. Remembered in this browser; if storage is blocked it lasts until reload.
const KEY = "kca-manager-sidebar";
const EVENT = "kca-sidebar-change";
let memory = false;
function read() {
  try { const saved = localStorage.getItem(KEY); if (saved) return saved === "open"; } catch { /* storage blocked */ }
  return memory;
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
export function useSidebar() {
  const open = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    memory = !open;
    try { localStorage.setItem(KEY, memory ? "open" : "closed"); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { open, toggle };
}
