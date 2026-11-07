import Link from "next/link";
import { StateBoard } from "@/components/signal";
import { Button } from "@/components/ui";
import s from "./settings.module.css";

export function SettingsHeader({ title, eyebrow = "Settings", description, action }: {
  title: string; eyebrow?: string; description?: string; action?: React.ReactNode;
}) {
  return <header className={s.header}><div><Link className={s.eyebrow} href="/settings">{eyebrow}</Link><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`${s.panel} ${className}`}>{children}</section>;
}
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className={s.field}><label htmlFor={htmlFor}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}
export function SettingsState({ loading, error, empty = "No signal", retry }: {
  loading?: boolean; error?: unknown; empty?: string; retry?: () => void;
}) {
  return <div className={s.state}><StateBoard state={loading ? "loading" : "no-signal"} text={error ? "Signal interrupted" : empty} />
    {error ? <p role="alert">{error instanceof Error ? error.message : "Could not load this view."}</p> : loading ? <p>Getting your workspace ready.</p> : null}
    {!!error && retry && <Button variant="default" onClick={retry}>Try again</Button>}</div>;
}
export function Feedback({ error, message }: { error?: unknown; message?: string | null }) {
  if (error) return <div className={s.feedback} role="alert"><StateBoard state="no-signal" text="Needs attention" colour="var(--bad)" /><p>{error instanceof Error ? error.message : String(error)}</p></div>;
  return message ? <p className={s.success} role="status">{message}</p> : null;
}
export function Avatar({ name }: { name: string }) {
  return <span className={s.avatar} aria-hidden="true">{name.trim().split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</span>;
}
export function HealthLight({ state }: { state: string }) {
  const colour = state === "Error" ? "var(--bad)" : state === "Syncing" ? "var(--good)" : "var(--warn)";
  return <span className={s.health}><i style={{ background: colour }} aria-hidden="true" />{state === "Syncing" ? "Healthy" : state === "Error" ? "Needs attention" : state === "Backfilling" ? "Initial sync" : "Waiting for sync"}</span>;
}
export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className={s.stat}><b>{value}</b><small>{label}</small></div>;
}
export function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not yet";
}
