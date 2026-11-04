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
export default function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  return <label className="theme-control"><Sun size={15} aria-hidden="true" /><span className="theme-day">Day</span><Switch aria-label="Theme" checked={dark} onCheckedChange={(value) => {
    const theme = value ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("kca-theme", theme); } catch {}
    document.cookie = "kca-theme=" + theme + ";path=/;max-age=31536000;SameSite=Lax";
  }} /><Moon size={15} aria-hidden="true" /><span className="theme-night">Night</span></label>;
}
