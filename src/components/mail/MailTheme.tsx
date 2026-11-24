"use client";
import { useEffect, useState } from "react";
import MailIcon from "./MailIcon";

export default function MailTheme() {
  const [preference, setPreference] = useState("system");
  useEffect(() => {
    const read = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("kca-theme"); } catch {}
      const cookie = document.cookie.match(/(?:^|; )kca-theme=(dark|light)(?:;|$)/)?.[1];
      return saved === "dark" || saved === "light" ? saved : cookie ?? "system";
    };
    const media = matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => { const value = read(); setPreference(value); document.documentElement.dataset.theme = value === "system" ? media.matches ? "dark" : "light" : value; };
    refresh();
    window.addEventListener("storage", refresh); media.addEventListener("change", refresh);
    return () => { window.removeEventListener("storage", refresh); media.removeEventListener("change", refresh); };
  }, []);
  function change(value: string) {
    setPreference(value);
    try { if (value === "system") localStorage.removeItem("kca-theme"); else localStorage.setItem("kca-theme", value); } catch {}
    applyPreference(value);
  }
  return <div className="theme-seg" role="group" aria-label="Theme">{[["light", "sun"], ["dark", "moon"], ["system", "system"]].map(([value, icon]) => <button key={value} type="button" data-t={value} aria-label={`${value[0].toUpperCase() + value.slice(1)} theme`} title={value} aria-pressed={preference === value} onClick={() => change(value)}><MailIcon name={icon} size="sm" /></button>)}</div>;
}

function applyPreference(value:string) {
    document.cookie = value === "system" ? "kca-theme=;path=/;max-age=0;SameSite=Lax" : `kca-theme=${value};path=/;max-age=31536000;SameSite=Lax`;
    document.documentElement.dataset.theme = value === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : value;
}
