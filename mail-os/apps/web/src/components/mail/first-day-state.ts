"use client";

import { useCallback, useSyncExternalStore } from "react";

const eventName = "kwetu-first-day";
export function firstDayKey(userId: string, flag: string) { return `kwetu:${userId}:${flag}`; }
export function readFirstDayFlag(userId: string, flag: string) {
  try { return localStorage.getItem(firstDayKey(userId, flag)) === "true"; } catch { return false; }
}
export function setFirstDayFlag(userId: string, flag: string, value: boolean) {
  try {
    if (value) localStorage.setItem(firstDayKey(userId, flag), "true");
    else localStorage.removeItem(firstDayKey(userId, flag));
  } catch { /* Guidance stays usable when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(eventName));
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(eventName, listener); };
}
export function useFirstDayFlag(userId: string, flag: string) {
  const snapshot = useCallback(() => readFirstDayFlag(userId, flag), [userId, flag]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
