"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { settingsApi, auditKind, auditLabel } from "@/lib/signal-settings";
import { Heatmap } from "@/components/signal";
import { Panel, SettingsHeader, SettingsState } from "@/components/settings/settings";
import s from "./page.module.css";
import { formatDate, formatTime, plural } from "@/lib/format";

export default function AdminAuditPage() {
  const { ready } = useRequireAuth("Admin");
  const [filter, setFilter] = useState("All");
  const entries = useQuery({ queryKey: ["admin-audit"], queryFn: api.adminAuditLog, enabled: ready });
  const daily = useQuery({ queryKey: ["admin-audit-daily"], queryFn: ({ signal }) => settingsApi.dailyAudit(signal), enabled: ready });
  if (!ready) return <SettingsState loading />;
  const filtered = (entries.data ?? []).filter((entry) => filter === "All" || auditKind(entry.action).label === filter);
  const groups = Map.groupBy(filtered, (entry) => formatDate(entry.createdAt));
  return <div className={s.page}>
    <SettingsHeader title="Audit log" context="Settings / Admin" description="Every administrative action, newest first" />
    <Panel><h2>Activity in the last 12 weeks</h2>{daily.isPending ? <SettingsState loading /> : daily.isError ? <SettingsState error={daily.error} retry={() => void daily.refetch()} /> : <ActivitySummary days={daily.data.days} today={daily.data.today} weeks={daily.data.weeks} />}</Panel>
    <div className={s.filters} role="group" aria-label="Filter audit events">{["All", "Security", "Invite", "Role", "Settings", "Access"].map((kind) => <button key={kind} className={s.filter} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div>
    <p className={s.note}>The latest 200 events, in Nairobi time</p>
    {entries.isPending ? <SettingsState loading /> : entries.isError ? <SettingsState error={entries.error} retry={() => void entries.refetch()} /> : filtered.length === 0 ? <SettingsState empty={filter === "All" ? "No recorded events" : "No matching events"} /> : <div key={filter} className={s.timeline}>{Array.from(groups, ([day, events]) => <section className={s.day} key={day}><h2>{day}</h2><ol>{events.map((entry) => {
      const kind = auditKind(entry.action);
      return <li key={entry.id} className={s.entry}><time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time><span className={s.eventMark} aria-hidden="true">{kind.label.slice(0, 1)}</span><div><b className={s.entryLabel}>{auditLabel(entry.action)}</b><p className={s.entryMeta}>{entry.actorEmail}{entry.targetEmail ? ", for " + entry.targetEmail : ""}</p>{entry.details && <small className={s.entryMeta}>{entry.details}</small>}</div></li>;
    })}</ol></section>)}</div>}
  </div>;
}

/** The heatmap earns its space only when events fall on at least three days. */
function ActivitySummary({ days, today, weeks }: { days: { date: string; count: number }[]; today: string; weeks: number }) {
  const active = days.filter((day) => day.count > 0);
  const total = active.reduce((sum, day) => sum + day.count, 0);
  if (active.length < 3) return <p className={s.note}>{total === 0 ? "No events in the last 12 weeks" : `${plural(total, "event")} on ${plural(active.length, "day")} in the last 12 weeks`}</p>;
  return <><div className={s.activity}><Heatmap today={today} weeks={weeks} values={Object.fromEntries(days.map((day) => [day.date, day.count]))} label="Administrative event counts by UTC day over the last 12 weeks" /></div><p className={s.note}>Events per day, counted in UTC</p></>;
}
