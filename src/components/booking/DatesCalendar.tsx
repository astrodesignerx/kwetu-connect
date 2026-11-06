"use client";
import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { addDays } from "@/lib/booking/hours";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function label(value: string, withDay = true) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: withDay ? "short" : undefined, day: "numeric", month: "short", timeZone: "UTC" });
}

// Pick a range in two taps: first tap sets the first day, second tap the last day.
// Bold days are days in the range when the advert plays (a weekday with picked boxes).
export default function DatesCalendar({ from, to, earliest, playDays, onChange }: {
  from: string; to: string; earliest: string; playDays: number[];
  onChange: (range: { startDate: string; endDate: string }) => void;
}) {
  const [view, setView] = useState(() => ({ y: Number(from.slice(0, 4)), m: Number(from.slice(5, 7)) - 1 }));
  const [pickingEnd, setPickingEnd] = useState(false);
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const monthName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const latest = pickingEnd ? addDays(from, 365) : "9999-12-31";
  const canGoBack = iso(view.y, view.m, 1) > earliest.slice(0, 7) + "-01";
  const move = (step: number) => setView(({ y, m }) => { const n = m + step; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });

  function pick(day: string) {
    if (!pickingEnd || day < from) { onChange({ startDate: day, endDate: day }); setPickingEnd(true); return; }
    onChange({ startDate: from, endDate: day }); setPickingEnd(false);
  }

  return <div className="dates-calendar">
    <div className="calendar-head">
      <button type="button" className="calendar-nav" aria-label="Previous month" disabled={!canGoBack} onClick={() => move(-1)}><CaretLeft size={14} aria-hidden="true" /></button>
      <b aria-live="polite">{monthName}</b>
      <button type="button" className="calendar-nav" aria-label="Next month" onClick={() => move(1)}><CaretRight size={14} aria-hidden="true" /></button>
    </div>
    <div className="calendar-weekdays" aria-hidden="true">{WEEKDAYS.map((d) => <span key={d} className="calendar-weekday">{d}</span>)}</div>
    <div className="calendar-grid" key={monthName} role="group" aria-label={monthName}>
      {Array.from({ length: lead }, (_, i) => <span key={"blank" + i} />)}
      {Array.from({ length }, (_, i) => {
        const day = iso(view.y, view.m, i + 1);
        const inRange = day >= from && day <= to;
        const edge = day === from ? " is-start" : "";
        const end = day === to ? " is-end" : "";
        const plays = inRange && playDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
        const disabled = day < earliest || day > latest;
        return <button key={day} type="button" disabled={disabled} aria-pressed={inRange}
          aria-label={`${label(day)}${inRange ? (plays ? ", your advert plays" : ", in your dates") : ""}`}
          className={`calendar-day${inRange ? " in-range" : ""}${edge}${end}${plays ? " plays" : ""}`} onClick={() => pick(day)}>{i + 1}</button>;
      })}
    </div>
    <p className="calendar-foot" role="status">
      <span>{pickingEnd ? "Now tap the last day" : `${label(from)} to ${label(to)}`}</span>
      <span>{pickingEnd ? `From ${label(from, false)}` : "Bold days play"}</span>
    </p>
  </div>;
}
