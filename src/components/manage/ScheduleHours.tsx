"use client";
import { useState } from "react";
import { dateRange, formatHour, weekdayOf } from "@/lib/booking/hours";
import { nairobiClock } from "@/lib/dashboard";
import { dateRange as rangeLabel, dayDate } from "@/lib/format/dates";
import type { BookingSettings } from "@/lib/booking/settings";
import type { Schedule } from "@/lib/booking/playlist";
import { CapsuleBars } from "./V2Visuals";
import ScheduleSelectedHour from "./ScheduleSelectedHour";
import ScheduleWeekGrid from "./ScheduleWeekGrid";

export default function ScheduleHours({ schedule, businesses, settings, from, to, now }: { schedule: Schedule; businesses: Record<string, string>; settings: BookingSettings; from: string; to: string; now: string }) {
  const clock = nairobiClock(new Date(now));
  const dates = dateRange(from, to);
  const first = Math.min(...Object.values(settings.screenHours).map((day) => day.open));
  const last = Math.max(...Object.values(settings.screenHours).map((day) => day.close));
  const hours = Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index);
  function playlistFor(date: string, hour: number) {
    const row = schedule.rows.find((item) => item.startDate <= date && item.endDate >= date && item.startHour <= hour && item.endHour > hour);
    return schedule.playlists.find((item) => item.name === row?.playlist) ?? null;
  }
  function entries(date: string, hour: number) {
    const playlist = playlistFor(date, hour);
    const values = new Map<string, number>();
    for (const item of playlist?.items ?? []) if (item.kind === "advert") values.set(item.bookingId, (values.get(item.bookingId) ?? 0) + item.seconds);
    return [...values].map(([reference, seconds]) => ({ reference, seconds, share: seconds / settings.secondsForSalePerHour, business: businesses[reference] ?? reference }));
  }
  const openAt = (date: string, hour: number) => { const day = settings.screenHours[weekdayOf(date)]; return Boolean(day) && hour >= day.open && hour < day.close; };
  // Start on the current hour. At night, or in an hour with no plays, start on the next open hour that has plays,
  // today first and then the following days, so the donut shows who holds that hour. A closed tile stays closed only when clicked.
  const [chosen, setChosen] = useState(() => {
    const date = dates.includes(clock.date) ? clock.date : from;
    const sameDay = date === clock.date;
    for (const day of dates.slice(dates.indexOf(date))) {
      for (const hour of hours) {
        if (day === date && sameDay && hour < clock.hour) continue;
        if (openAt(day, hour) && entries(day, hour).length) return { date: day, hour };
      }
    }
    return { date, hour: hours.includes(clock.hour) ? clock.hour : first };
  });
  const rows = dates.map((date) => ({ date, label: new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), hours: hours.map((hour) => ({ hour, share: entries(date, hour).reduce((total, entry) => total + entry.share, 0), closed: !openAt(date, hour) })) }));
  const selectedDay = rows.find((row) => row.date === chosen.date) ?? rows[0];
  const openHours = selectedDay ? selectedDay.hours.filter((hour) => !hour.closed) : [];
  const average = openHours.length ? openHours.reduce((sum, hour) => sum + hour.share, 0) / openHours.length : 0;
  const peakEntry = openHours.reduce<{ hour: number; share: number } | null>((best, item) => (!best || item.share > best.share ? item : best), null);
  const peak = peakEntry?.share ?? 0;
  const openSpan = openHours.length ? `${String(openHours[0].hour).padStart(2, "0")} to ${String(openHours[openHours.length - 1].hour + 1).padStart(2, "0")}` : "Closed";
  const blocks = Object.values(settings.timeBlocks).map((block) => ({ ...block, hours: openHours.filter((hour) => hour.hour >= block.startHour && hour.hour < block.endHour).length })).filter((block) => block.hours);
  const isSelectedOpen = openAt(chosen.date, chosen.hour);
  const selectedShare = Math.round((selectedDay?.hours.find((item) => item.hour === chosen.hour)?.share ?? 0) * 100);
  const selectedPlaylist = playlistFor(chosen.date, chosen.hour);
  function chooseDay(date: string) {
    const screen = settings.screenHours[weekdayOf(date)];
    if (!screen || screen.open >= screen.close) {
      setChosen({ date, hour: first });
      return;
    }
    setChosen({ date, hour: Math.max(screen.open, Math.min(chosen.hour, screen.close - 1)) });
  }
  return <div className="v2-schedule-hours"><div className="v2-schedule-top">
    <section className="v2-card mg-schedule-day">
      <div className="v2-card-heading">
        <div>
          <span className="mg-eyebrow">{dayDate(chosen.date)}, planned plays by hour</span>
          <h2>{chosen.date === clock.date ? "Today" : "Selected day"}</h2>
        </div>
        <div className="mg-schedule-days" role="group" aria-label="Schedule day">{rows.map((row) => <button type="button" key={row.date} aria-pressed={row.date === chosen.date} data-today={row.date === clock.date} onClick={() => chooseDay(row.date)}>{row.label} {Number(row.date.slice(-2))}<span className="sr-only"> ({dayDate(row.date)})</span></button>)}</div>
      </div>
      <div className="mg-schedule-stats">
        <span>{isSelectedOpen ? <><b>{selectedShare}%</b> sold at {formatHour(chosen.hour)}</> : <><b>Closed</b> at {formatHour(chosen.hour)}</>}</span>
        <dl>
          <div><dt>Day average</dt><dd>{Math.round(average * 100)}%</dd></div>
          <div><dt>{peakEntry ? `Peak, from ${formatHour(peakEntry.hour)}` : "Peak"}</dt><dd>{Math.round(peak * 100)}%</dd></div>
          <div><dt>Screen open</dt><dd>{openSpan}</dd></div>
        </dl>
      </div>
      <div className="mg-bars-wrap">
        <div className="mg-y-labels" aria-hidden="true"><span>100%</span><span>50%</span><span>0</span></div>
        <CapsuleBars hours={openHours} currentHour={chosen.date === clock.date ? clock.hour : undefined} selectedHour={chosen.hour} onSelect={(hour) => setChosen({ ...chosen, hour })} readout />
      </div>
      <div className="mg-schedule-bands">{blocks.map((block) => <span key={block.startHour} style={{ flex: block.hours }} data-on={chosen.hour >= block.startHour && chosen.hour < block.endHour}>{block.label}</span>)}</div>
    </section>
    <ScheduleSelectedHour
      date={chosen.date}
      hour={chosen.hour}
      items={entries(chosen.date, chosen.hour)}
      secondsForSale={settings.secondsForSalePerHour}
      isOpen={isSelectedOpen}
      playlist={selectedPlaylist ? { name: selectedPlaylist.name, entries: selectedPlaylist.items.length } : null}
    />
    </div>{Array.from({ length: Math.ceil(rows.length / 7) }, (_, index) => rows.slice(index * 7, index * 7 + 7)).map((week) => <section className="v2-card mg-schedule-week" key={week[0].date}><div className="v2-card-heading"><div><span className="mg-eyebrow">{rangeLabel(week[0].date, week[week.length - 1].date)}, planned from bookings</span><h2>This week by hour</h2></div></div><ScheduleWeekGrid rows={week} blocks={settings.timeBlocks} selected={chosen} today={clock.date} onSelect={(date, hour) => setChosen({ date, hour })} /></section>)}</div>;
}
