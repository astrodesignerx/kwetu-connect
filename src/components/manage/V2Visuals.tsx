"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { formatHour } from "@/lib/booking/hours";
import { ChartBar, Clock, Coins, Play } from "@phosphor-icons/react";

export function DarkIsland({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"v2-card v2-dark " + className}>{children}</section>;
}

export function FolderCard({ label, value, note, colour = "teal", children, photo = false }: { label: string; value: ReactNode; note: string; colour?: string; children?: ReactNode; photo?: boolean }) {
  const Icon = photo ? ChartBar : colour === "violet" ? Clock : colour === "green" ? Play : Coins;
  return <section className={"v2-folder" + (photo ? " v2-folder-photo" : "")} data-colour={colour}>
    <div className="v2-folder-label"><i aria-hidden="true"><Icon size={14} /></i>{label}</div>
    <div className="v2-folder-value">{value}</div><p>{note}</p>{children}
  </section>;
}

export type HourShare = { hour: number; share: number };
export function CapsuleBars({ hours, currentHour, label = "Planned time sold", onSelect, selectedHour }: { hours: HourShare[]; currentHour?: number; label?: string; onSelect?: (hour: number) => void; selectedHour?: number }) {
  const [local, setLocal] = useState<number | null>(null);
  const selected = selectedHour ?? local ?? currentHour ?? hours[0]?.hour;
  const active = hours.find((item) => item.hour === selected);
  return <div className="v2-capsule-chart">
    <p className="v2-chart-readout" aria-live="polite">{active ? `${formatHour(active.hour)} / ${Math.round(active.share * 100)}% sold` : "The screen is closed"}</p>
    <div className="v2-capsules" role="group" aria-label={label} style={{ "--hours": Math.max(hours.length, 1) } as CSSProperties}>
      {hours.map(({ hour, share }) => <button type="button" key={hour} className="v2-capsule" aria-pressed={selected === hour} aria-label={`${formatHour(hour)}, ${Math.round(share * 100)}% sold, planned`} data-past={currentHour !== undefined && hour < currentHour} onClick={() => { setLocal(hour); onSelect?.(hour); }}>
        <span className="v2-capsule-track"><i style={{ transform: `scaleY(${Math.max(0.015, Math.min(1, share))})` }} /></span><small>{String(hour).padStart(2, "0")}</small>
      </button>)}
    </div>
  </div>;
}

export type HourTileRow = { date: string; label: string; hours: { hour: number; share: number; closed?: boolean }[] };
export function HourTiles({ rows, onSelect, selected, today }: { rows: HourTileRow[]; onSelect?: (date: string, hour: number) => void; selected?: string; today?: string }) {
  const [local, setLocal] = useState("");
  const chosen = selected ?? local;
  const hours = [...new Set(rows.flatMap((row) => row.hours.map((hour) => hour.hour)))].sort((a, b) => a - b);
  const item = rows.flatMap((row) => row.hours.map((hour) => ({ ...hour, date: row.date, label: row.label }))).find((hour) => `${hour.date}T${hour.hour}` === chosen);
  return <div className="v2-hour-grid">
    <div className="v2-tile-readout" aria-live="polite">{item ? `${item.label} ${formatHour(item.hour)}, ${item.closed ? "screen closed" : Math.round(item.share * 100) + "% sold, planned"}` : "Choose an hour to see planned time sold"}</div>
    <div className="v2-tiles" style={{ "--hours": hours.length } as CSSProperties} role="group" aria-label="Planned time sold by day and hour">
      <span />{hours.map((hour) => <span className="v2-hour-label" key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>)}
      {rows.map((row) => <div className="v2-tile-row" key={row.date}><span className="v2-day-label" data-today={today === row.date}>{row.label}</span>{hours.map((hour) => {
        const value = row.hours.find((item) => item.hour === hour);
        const closed = !value || value.closed;
        const key = `${row.date}T${hour}`;
        return <button type="button" key={hour} className="v2-hour-tile" data-level={closed || !value.share ? 0 : value.share < .4 ? 1 : value.share < .8 ? 2 : 3} data-closed={closed} aria-pressed={chosen === key} aria-label={`${row.label} ${formatHour(hour)}, ${closed ? "screen closed" : Math.round(value.share * 100) + "% sold, planned"}`} onClick={() => { setLocal(key); onSelect?.(row.date, hour); }} />;
      })}</div>)}
    </div>
    <div className="v2-tile-legend"><span><i data-level="0" />Open</span><span><i data-level="1" />Below 40%</span><span><i data-level="2" />40 to 79%</span><span><i data-level="3" />80% or more</span><span><i data-closed="true" />Closed</span></div>
  </div>;
}

export function StageShareBar({ stages }: { stages: { label: string; count: number }[] }) {
  return <section className="v2-card v2-stage-shares"><h2>Bookings by stage</h2><div className="v2-share-labels">{stages.map(({ label, count }) => <strong key={label}>{count}<small>{label}</small></strong>)}</div><div className="v2-share-bars" aria-hidden="true">{stages.map(({ label, count }) => <i key={label} data-stage={label} style={{ flex: Math.max(.1, count) }} />)}</div></section>;
}
