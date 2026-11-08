"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { currentPlaylist, nairobiClock, onAirStatus } from "@/lib/dashboard";
import type { BookingSettings } from "@/lib/booking/settings";
import type { Schedule, PlaylistItem } from "@/lib/booking/playlist";

export default function OverviewBanner({ sold, needs, live, schedule, businesses, settings, now, error }: { sold: number; needs: number; live: number; schedule: Schedule | null; businesses: Record<string, string>; settings: BookingSettings; now: string; error: boolean }) {
  const [time, setTime] = useState(now);
  useEffect(() => { const timer = setInterval(() => setTime(new Date().toISOString()), 15000); return () => clearInterval(timer); }, []);
  const clock = nairobiClock(new Date(time));
  const status = onAirStatus(settings, new Date(time));
  const items = schedule ? currentPlaylist(schedule, clock.date, clock.hour, clock.second) : { current: null, next: null };
  const label = (item: PlaylistItem | null) => !item ? "No scheduled item" : item.kind === "advert" ? businesses[item.bookingId] ?? "Scheduled advert" : "KCA time";
  return <section className="v2-home-banner">
    <Image className="v2-photo-night" src="/images/evening-billboard.webp" alt="KCA screen on Kisumu Ndogo Road in Eldoret" fill priority sizes="(max-width: 767px) 100vw, 50vw" />
    <Image className="v2-photo-day" src="/images/daytime-billboard.webp" alt="" fill sizes="(max-width: 767px) 100vw, 50vw" />
    <div className="v2-banner-copy"><p className="v2-banner-eyebrow"><i />Kisumu Ndogo Rd, Eldoret</p><h1>Tonight is <span>{Math.round(sold * 100)}% sold</span></h1><p>{live} {live === 1 ? "booking" : "bookings"} live and {needs} {needs === 1 ? "thing needs" : "things need"} you. Every figure is planned from the schedule.</p><div><Link href="/manage/schedule" className="v2-white-button"><CalendarBlank size={14} aria-hidden="true" />Open schedule</Link><a href="#needs-you" className="v2-glass-button">Needs you <b>{needs}</b></a></div></div>
    <div className="v2-now-glass"><small>{status.onAir ? "Planned now" : "Screen off air"}</small><strong key={label(items.current)}>{error ? "Schedule unavailable" : status.onAir ? label(items.current) : status.label}</strong><span>{status.onAir && items.current ? `${items.current.seconds}s / ${String(clock.hour).padStart(2, "0")}:${String(Math.floor(clock.second / 60)).padStart(2, "0")} EAT` : "KCA screen, Eldoret"}</span><div className="v2-playback-track"><i style={{ transform: `scaleX(${status.onAir && items.current ? Math.min(1, Math.max(0, (clock.second - items.current.start) / items.current.seconds)) : 0})` }} /></div><p>Next <b>{status.onAir && !error ? label(items.next) : "Screen hours in Settings"}</b><ArrowRight size={12} aria-hidden="true" /></p><small>Planned, not a live feed</small></div>
  </section>;
}
