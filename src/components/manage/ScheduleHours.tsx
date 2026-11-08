"use client";
import { useState } from "react";
import Link from "next/link";
import { dateRange, formatHour, weekdayOf } from "@/lib/booking/hours";
import { nairobiClock } from "@/lib/dashboard";
import type { BookingSettings } from "@/lib/booking/settings";
import type { Schedule } from "@/lib/booking/playlist";
import { CapsuleBars, DarkIsland, HourTiles } from "./V2Visuals";

const COLOURS = ["#edb347", "#2dd4bf", "#60a5fa", "#a78bfa", "#fb7185", "#a3e635", "#fb923c"];
export default function ScheduleHours({ schedule, businesses, settings, from, to, now }: { schedule: Schedule; businesses: Record<string, string>; settings: BookingSettings; from: string; to: string; now: string }) {
  const clock = nairobiClock(new Date(now));
  const dates = dateRange(from, to);
  const [chosen, setChosen] = useState({ date: dates.includes(clock.date) ? clock.date : from, hour: clock.hour });
  const first = Math.min(...Object.values(settings.screenHours).map((day) => day.open));
  const last = Math.max(...Object.values(settings.screenHours).map((day) => day.close));
  const hours = Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index);
  function entries(date: string, hour: number) {
    const row = schedule.rows.find((row) => row.startDate <= date && row.endDate >= date && row.startHour <= hour && row.endHour > hour);
    const playlist = schedule.playlists.find((playlist) => playlist.name === row?.playlist);
    const values = new Map<string, number>();
    for (const item of playlist?.items ?? []) if (item.kind === "advert") values.set(item.bookingId, (values.get(item.bookingId) ?? 0) + item.seconds);
    return [...values].map(([reference, seconds]) => ({ reference, seconds, share: seconds / settings.secondsForSalePerHour, business: businesses[reference] ?? reference }));
  }
  const openAt = (date: string, hour: number) => { const day = settings.screenHours[weekdayOf(date)]; return hour >= day.open && hour < day.close; };
  const rows = dates.map((date) => ({ date, label: new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), hours: hours.map((hour) => ({ hour, share: entries(date, hour).reduce((total, entry) => total + entry.share, 0), closed: !openAt(date, hour) })) }));
  const items = entries(chosen.date, chosen.hour);
  const sold = items.reduce((total, entry) => total + entry.share, 0);
  let offset = 0;
  return <div className="v2-schedule-hours"><div className="v2-schedule-top"><DarkIsland className="v2-schedule-caps"><div className="v2-card-heading"><h2>{chosen.date === clock.date ? "Today" : "Selected day"}<small>{chosen.date}, planned plays by hour</small></h2><span className="soft-pill">Nairobi time</span></div><CapsuleBars hours={rows.find((row) => row.date === chosen.date)?.hours.filter((hour) => !hour.closed) ?? []} currentHour={chosen.date === clock.date ? clock.hour : undefined} selectedHour={chosen.hour} onSelect={(hour) => setChosen({ ...chosen, hour })} /></DarkIsland>
      <section className="v2-card v2-hour-donut"><div className="v2-card-heading"><h2>{formatHour(chosen.hour)} to {formatHour(chosen.hour + 1)}<small>{chosen.date} / planned</small></h2></div><div className="v2-donut-content" key={chosen.date + chosen.hour}><div className="v2-donut"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="var(--muted)" strokeWidth="12" />{items.map((item, index) => { const start = offset; const share = Math.min(item.share * 100, Math.max(0, 100 - offset)); offset += share; return <circle key={item.reference} cx="60" cy="60" r="48" pathLength="100" fill="none" stroke={COLOURS[index % COLOURS.length]} strokeWidth="12" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} />; })}</svg><div><b>{openAt(chosen.date, chosen.hour) ? Math.round(sold * 100) + "%" : "Closed"}</b><small>{openAt(chosen.date, chosen.hour) ? `${(sold * settings.secondsForSalePerHour / 60).toFixed(1)} of ${settings.secondsForSalePerHour / 60} min` : "Screen hours"}</small></div></div><div className="v2-donut-legend">{items.map((item, index) => <Link key={item.reference} href={"/manage/bookings/" + item.reference}><i style={{ background: COLOURS[index % COLOURS.length] }} /><span>{item.business}</span><small>{(item.seconds / 60).toFixed(1)} min</small></Link>)}{openAt(chosen.date, chosen.hour) && <div><i /><span>Unsold saleable time</span><small>{(Math.max(0, 1 - sold) * settings.secondsForSalePerHour / 60).toFixed(1)} min</small></div>}{!openAt(chosen.date, chosen.hour) && <p>No plays are planned in this hour.</p>}</div></div><p className="pipeline-help">Share of saleable time. Reserved KCA time is separate.</p></section>
    </div>{Array.from({ length: Math.ceil(rows.length / 7) }, (_, index) => rows.slice(index * 7, index * 7 + 7)).map((week) => <section className="v2-card" key={week[0].date}><div className="v2-card-heading"><h2>This week by hour</h2><small>{week[0].date} to {week[week.length - 1].date}</small></div><HourTiles rows={week} selected={`${chosen.date}T${chosen.hour}`} today={clock.date} onSelect={(date, hour) => setChosen({ date, hour })} /></section>)}</div>;
}
