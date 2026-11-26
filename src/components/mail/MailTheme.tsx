"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import MailIcon from "./MailIcon";

const choices = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["graphite", "Graphite"],
  ["system", "System"],
] as const;

type Preference = typeof choices[number][0];
type SharedPreference = Exclude<Preference, "graphite">;
const mediaQuery = "(prefers-color-scheme: dark)";
const sharedKey = "kca-theme";
const mailKey = "kca-mail-theme";
const Appearance = createContext<{ preference: Preference; ready: boolean; change: (value: Preference) => void } | null>(null);

function sharedPreference(): SharedPreference {
  let saved: string | null = null;
  try { saved = localStorage.getItem(sharedKey); } catch {}
  if (saved === "light" || saved === "dark") return saved;
  const cookie = document.cookie.match(/(?:^|;\s*)kca-theme=(dark|light)(?:;|$)/)?.[1];
  return cookie === "dark" || cookie === "light" ? cookie : "system";
}

function applyShared(value: SharedPreference, systemDark: boolean) {
  document.documentElement.dataset.theme = value === "system" ? (systemDark ? "dark" : "light") : value;
}

function saveCookie(key: string, value: string | null, path: string) {
  document.cookie = `${key}=${value ?? ""};path=${path};max-age=${value ? 31536000 : 0};SameSite=Lax`;
}

export function MailAppearance({ children, className, initialGraphite }: {
  children: ReactNode;
  className: string;
  initialGraphite: boolean;
}) {
  const [saved, setPreference] = useState<Preference | null>(null);
  const preference = saved ?? (initialGraphite ? "graphite" : "system");

  useEffect(() => {
    const media = matchMedia(mediaQuery);
    const refresh = () => {
      const shared = sharedPreference();
      const graphite = /(?:^|;\s*)kca-mail-theme=graphite(?:;|$)/.test(document.cookie);
      setPreference(graphite ? "graphite" : shared);
      applyShared(shared, media.matches);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    media.addEventListener("change", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
      media.removeEventListener("change", refresh);
    };
  }, []);

  function change(value: Preference) {
    saveCookie(mailKey, value === "graphite" ? value : null, "/mail");
    if (value !== "graphite") {
      saveCookie(sharedKey, value === "system" ? null : value, "/");
      applyShared(value, matchMedia(mediaQuery).matches);
    }
    // The mail cookie provides the first paint. Its storage key notifies other tabs.
    try {
      if (value === "graphite") {
        localStorage.setItem(mailKey, value);
      } else {
        if (value === "system") localStorage.removeItem(sharedKey);
        else localStorage.setItem(sharedKey, value);
        localStorage.removeItem(mailKey);
      }
    } catch {}
    setPreference(value);
  }

  return <Appearance.Provider value={{ preference, ready: saved !== null, change }}>
    <div className={className} data-mail-theme={preference === "graphite" ? preference : undefined}>
      {children}
    </div>
  </Appearance.Provider>;
}

const icons: Record<Preference, string> = { light: "sun", dark: "moon", graphite: "graphite", system: "system" };

/** The appearance choices, shown inside the staff account menu. */
export default function MailTheme() {
  const appearance = useContext(Appearance);
  if (!appearance) return null;
  return <div className="theme-options" role="group" aria-label="Appearance">
    <p className="menu-label">Appearance</p>
    {choices.map(([value, label]) => <button key={value} type="button" aria-pressed={appearance.preference === value} disabled={!appearance.ready} onClick={() => appearance.change(value)}>
      <MailIcon name={icons[value]} size="sm" />{label}{appearance.preference === value && <MailIcon name="check" size="xs" className="theme-check" />}
    </button>)}
  </div>;
}
