"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui";

const KEY = "ccos-theme";
const EVENT = "kwetu-theme-change";

function preference() {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(EVENT));
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch { /* Storage is optional. */ }
  apply(dark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => apply(preference() ? preference() === "dark" : media.matches);
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return children;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe,
    () => document.documentElement.classList.contains("dark"), () => false);
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}
      aria-label={dark ? "Switch to Day" : "Switch to Night"} aria-pressed={dark}
      title={dark ? "Switch to Day" : "Switch to Night"}>
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </Button>
  );
}
