"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { settingsApi, auditKind, auditLabel } from "@/lib/signal-settings";
import { Heatmap } from "@/components/signal";
import { Panel, SettingsHeader, SettingsState } from "@/components/settings/settings";
import s from "./page.module.css";

export default function AdminAuditPage() {
  const { ready } = useRequireAuth("Admin");
  const [filter, setFilter] = useState("All");
  const entries = useQuery({ queryKey: ["admin-audit"], queryFn: api.adminAuditLog, enabled: ready });
  const daily = useQuery({ queryKey: ["admin-audit-daily"], queryFn: ({ signal }) => settingsApi.dailyAudit(signal), enabled: ready });
  if (!ready) return <SettingsState loading />;
  const filtered = (entries.data ?? []).filter((entry) => filter === "All" || auditKind(entry.action).label === filter);
  const groups = Map.groupBy(filtered, (entry) => new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
  return <div className={s.page}>
    <SettingsHeader title="Audit log" context="Settings / Admin" description="A readable record of administrative actions." />
    <Panel><h2>Activity / last 12 weeks</h2>{daily.isPending ? <SettingsState loading /> : daily.isError ? <SettingsState error={daily.error} retry={() => void daily.refetch()} /> : <><div className={s.activity}><Heatmap today={daily.data.today} weeks={daily.data.weeks} values={Object.fromEntries(daily.data.days.map((day) => [day.date, day.count]))} label="Administrative event counts by UTC day over the last 12 weeks" /></div><p className={s.note}>UTC daily counts / all recorded events in this window</p></>}</Panel>
    <div className={s.filters} role="group" aria-label="Filter audit events">{["All", "Security", "Invite", "Role", "Settings", "Access"].map((kind) => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div>
    <p className={s.note}>Most recent 200 events. Timeline dates use your local time.</p>
    {entries.isPending ? <SettingsState loading /> : entries.isError ? <SettingsState error={entries.error} retry={() => void entries.refetch()} /> : filtered.length === 0 ? <SettingsState empty={filter === "All" ? "No recorded events" : "No matching events"} /> : <div key={filter} className={s.timeline}>{Array.from(groups, ([day, events]) => <section className={s.day} key={day}><h2>{day}</h2><ol>{events.map((entry) => {
      const kind = auditKind(entry.action);
      return <li key={entry.id}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time><span className={s.eventMark} aria-hidden="true">{kind.label.slice(0, 1)}</span><div><b>{auditLabel(entry.action)}</b><p>{entry.actorEmail}{entry.targetEmail ? " / " + entry.targetEmail : ""}</p>{entry.details && <small>{entry.details}</small>}</div></li>;
    })}</ol></section>)}</div>}
  </div>;
}
