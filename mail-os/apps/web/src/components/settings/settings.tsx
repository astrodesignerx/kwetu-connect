import { PageHeader } from "@/components/page-header";
import { Button, ViewState } from "@/components/ui";
import s from "./settings.module.css";

export function SettingsHeader({ title, context = "Settings", description, action }: {
  title: string; context?: string; description?: string; action?: React.ReactNode;
}) {
  return <PageHeader title={title} context={context || undefined} contextHref="/settings" description={description} action={action} />;
}
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`${s.panel} ${className}`}>{children}</section>;
}
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className={s.field}><label htmlFor={htmlFor}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}
export function SettingsState({ loading, error, empty = "Nothing here yet", retry }: {
  loading?: boolean; error?: unknown; empty?: string; retry?: () => void;
}) {
  return <div className={s.state}>
    <ViewState loading={loading} label={error ? "This could not load" : loading ? "Getting your workspace ready." : empty} />
    {!!error && <p role="alert">{error instanceof Error ? error.message : "Please try again."}</p>}
    {!!error && retry && <Button variant="default" onClick={retry}>Try again</Button>}
  </div>;
}
export function Feedback({ error, message }: { error?: unknown; message?: string | null }) {
  if (error) return <p className={s.feedback} role="alert">{error instanceof Error ? error.message : String(error)}</p>;
  return message ? <p className={s.success} role="status">{message}</p> : null;
}
export function Avatar({ name }: { name: string }) {
  return <span className={s.avatar} aria-hidden="true">{name.trim().split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}</span>;
}
export function HealthLight({ state }: { state: string }) {
  // Filled is healthy, a ring is waiting, a struck ring has failed. The words carry the same meaning.
  const dot = state === "Error" ? "failed" : state === "Syncing" ? "healthy" : "waiting";
  return <span className={s.health}><i className="status-dot" data-state={dot} aria-hidden="true" />{state === "Syncing" ? "Healthy" : state === "Error" ? "Needs attention" : state === "Backfilling" ? "Initial sync" : "Waiting for sync"}</span>;
}
export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return <div className={s.stat}><b>{value}</b><small>{label}</small></div>;
}
export function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not yet";
}
