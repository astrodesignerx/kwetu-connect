"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = matchMedia("(prefers-color-scheme: dark)");
  const system = () => { let saved = false; try { saved = !!localStorage.getItem("kca-theme"); } catch {} if (!saved && !document.cookie.includes("kca-theme=")) document.documentElement.dataset.theme = media.matches ? "dark" : "light"; };
  media.addEventListener("change", system);
  return () => { observer.disconnect(); media.removeEventListener("change", system); };
}
function setTheme(theme: "dark" | "light") {
  const update = () => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("kca-theme", theme); } catch {}
    document.cookie = "kca-theme=" + theme + ";path=/;max-age=31536000;SameSite=Lax";
  };
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(update);
  else update();
}
// toggle: one icon button for the manager top bar (2026-11-09).
// icons: two small sun and moon buttons for the compact book top bar (2026-11-05).
export default function ThemeSwitch({ variant = "switch" }: { variant?: "switch" | "icons" | "toggle" }) {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  if (variant === "toggle") return <button type="button" className="theme-toggle" aria-label="Theme" title={dark ? "Switch to day" : "Switch to night"} aria-pressed={dark} onClick={() => setTheme(dark ? "light" : "dark")}>{dark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}</button>;
  if (variant === "icons") return <div className="theme-icons" role="group" aria-label="Theme">
    <button type="button" aria-label="Day" title="Day" aria-pressed={!dark} onClick={() => setTheme("light")}><Sun size={14} aria-hidden="true" /></button>
    <button type="button" aria-label="Night" title="Night" aria-pressed={dark} onClick={() => setTheme("dark")}><Moon size={14} aria-hidden="true" /></button>
  </div>;
  return <label className="theme-control"><Sun size={15} aria-hidden="true" /><span className="theme-day">Day</span><Switch aria-label="Theme" checked={dark} onCheckedChange={(value) => setTheme(value ? "dark" : "light")} /><Moon size={15} aria-hidden="true" /><span className="theme-night">Night</span></label>;
}
