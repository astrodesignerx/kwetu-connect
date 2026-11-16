"use client";

import { useSyncExternalStore } from "react";

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const subscribe = (listener: () => void) => {
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
};
export const useReducedMotion = () => useSyncExternalStore(subscribe, reducedMotion, () => false);

export function motionTime(token: "--t1" | "--t2" | "--t3") {
  if (reducedMotion()) return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? parseFloat(value) * (value.endsWith("ms") ? 1 : 1000) : { "--t1": 120, "--t2": 200, "--t3": 320 }[token];
}
