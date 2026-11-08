"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dateRange, formatHour } from "@/lib/booking/hours";
import { nairobiClock } from "@/lib/dashboard";
import { dateRange as rangeLabel, dayDate, shortDate } from "@/lib/format/dates";
import type { BookingSettings } from "@/lib/booking/settings";
import type { TimelineCell } from "@/lib/manager-schedule";

export default function ScheduleTimeline({ cells, from, to, settings, now }: { cells: TimelineCell[]; from: string; to: string; settings: BookingSettings; now: string }) {
  const [clock, setClock] = useState(() => nairobiClock(new Date(now)));
  useEffect(() => { const timer = setInterval(() => setClock(nairobiClock(new Date())), 60000); return () => clearInterval(timer); }, []);
  const dates = dateRange(from, to);
  const references = [...new Set(cells.flatMap((cell) => cell.bookings.map((booking) => booking.reference)))];
  const todayCells = cells.filter((cell) => cell.date === clock.date && cell.start < cell.end);
  const open = Math.min(...todayCells.map((cell) => cell.start));
  const close = Math.max(...todayCells.map((cell) => cell.end));
  const hour = clock.hour + clock.second / 3600;
  const isOpen = todayCells.length > 0 && hour >= open && hour < close;
  const todayBookings = [...new Set(todayCells.flatMap((cell) => cell.bookings.map((booking) => booking.reference)))];
  const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;
  return <div className="schedule-visual">
    {todayCells.length > 0 && <details className="ns-card schedule-today"><summary>Today&apos;s timeline, {dayDate(clock.date)}<span className="schedule-clock">Now {String(clock.hour).padStart(2, "0")}:{String(Math.floor(clock.second / 60)).padStart(2, "0")} EAT</span></summary><div className="today-expanded">
      <div className="today-axis"><span>{formatHour(open)}</span><span>{formatHour(close)}</span></div>
      <div className="today-tracks">
        {isOpen && <div className="schedule-now-line" style={{ left: `${(hour - open) / (close - open) * 100}%` }} aria-label="Current Nairobi time" />}
        {todayBookings.map((reference) => { const active = todayCells.filter((cell) => cell.bookings.some((booking) => booking.reference === reference)); const booking = active[0].bookings.find((item) => item.reference === reference)!; return <div key={reference} className="today-track">{active.map((cell) => <Link key={cell.block} className="today-segment" data-colour={references.indexOf(reference) % 6} href={"/manage/bookings/" + reference} style={{ left: `${(cell.start - open) / (close - open) * 100}%`, width: `${(cell.end - cell.start) / (close - open) * 100}%` }} title={`${booking.business}, ${formatHour(cell.start)} to ${formatHour(cell.end)}`} aria-label={`${booking.business}, ${formatHour(cell.start)} to ${formatHour(cell.end)}`}>{booking.business}</Link>)}</div>; })}
        {!todayBookings.length && <p className="empty-state">KCA time only. No advertiser is scheduled today.</p>}
      </div><p className="pipeline-help">Planned screen hours. The now line shows local time, not measured playback.</p>
    </div></details>}
    {Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7)).map((week) => <section key={week[0]} className="ns-card schedule-week"><h2>{rangeLabel(week[0], week[week.length - 1])}</h2>
      <div className="schedule-week-scroll" role="region" aria-label="Week schedule, scroll to see all days" tabIndex={0}><div className="schedule-week-grid" style={{ gridTemplateColumns: `84px repeat(${week.length}, minmax(120px, 1fr))` }}>
        <span className="schedule-day-label">Screen hours</span>{week.map((date) => <div className="schedule-day-label" data-today={date === clock.date} key={date}><strong>{new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</strong><span>{shortDate(date)}</span></div>)}
        {Object.entries(settings.timeBlocks).map(([id, block]) => <div className="schedule-grid-row" key={id}><div className="schedule-block-label"><strong>{block.label}</strong><small>{formatHour(block.startHour)} to<br />{formatHour(block.endHour)}</small></div>{week.map((date) => {
          const cell = cells.find((item) => item.date === date && item.block === id)!;
          const closed = cell.end <= cell.start;
          return <div key={date} className="schedule-cell" data-now={date === clock.date && hour >= cell.start && hour < cell.end} data-closed={closed}>
            {closed ? <span>Screen closed</span> : <><div className="schedule-capacity" role="img" aria-label={`${percent(cell.share)} of saleable time scheduled`}>{cell.bookings.map((booking) => <i key={booking.reference} data-colour={references.indexOf(booking.reference) % 6} style={{ flex: `0 0 ${percent(booking.share)}` }} />)}</div><strong>{percent(cell.share)} scheduled</strong>
              {cell.bookings.length > 0 && <details className="schedule-cell-bookings"><summary>{cell.bookings.length} booking{cell.bookings.length === 1 ? "" : "s"}</summary><div>{cell.bookings.map((booking) => <Link href={"/manage/bookings/" + booking.reference} className="schedule-booking-bar" data-colour={references.indexOf(booking.reference) % 6} key={booking.reference} title={`${booking.business}: ${percent(booking.share)} of saleable time`}><span>{booking.business}</span><small>{percent(booking.share)}</small></Link>)}</div></details>}
              {!cell.bookings.length && <span>KCA time only</span>}
            </>}
          </div>;
        })}</div>)}
      </div></div>
    </section>)}
    <p className="pipeline-help">Bars show each booking&apos;s average share of saleable time during the block. KCA time includes the reserved screen time and any unsold time. Downloads below contain the exact playlist and hour entries.</p>
  </div>;
}
