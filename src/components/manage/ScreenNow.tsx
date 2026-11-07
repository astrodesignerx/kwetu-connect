"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Schedule, PlaylistItem } from "@/lib/booking/playlist";
import type { BookingSettings } from "@/lib/booking/settings";
import { currentPlaylist, nairobiClock, onAirStatus } from "@/lib/dashboard";
import { formatHour } from "@/lib/booking/hours";
import { Ring } from "@/components/workspace/Charts";
export default function ScreenNow({ schedule, businesses, shares, settings, now, error }: { schedule: Schedule | null; businesses: Record<string, string>; shares: { hour: number; share: number }[]; settings: BookingSettings; now: string; error: boolean }) {
  const [time, setTime] = useState(now);
  useEffect(() => { const timer = setInterval(() => setTime(new Date().toISOString()), 1000); return () => clearInterval(timer); }, []);
  const clock = nairobiClock(new Date(time));
  const status = onAirStatus(settings, new Date(time));
  const playlist = schedule ? currentPlaylist(schedule, clock.date, clock.hour, clock.second) : { current: null, next: null };
  const label = (item: PlaylistItem | null) => !item ? "No scheduled item" : item.kind === "advert" ? businesses[item.bookingId] ?? item.bookingId : "KCA time";
  return <section className="screen-preview screen-now"><Image src="/images/evening-billboard.webp" alt="KCA billboard in Eldoret" fill sizes="(max-width: 767px) 100vw, 42vw" priority /><div className="screen-now-content"><span className="on-air" data-live={status.onAir}>{status.onAir && <i aria-hidden="true" />}{status.onAir ? "On air" : "Off air"}</span><div className="screen-now-time"><strong>{status.onAir ? formatHour(clock.hour) + " to " + formatHour(clock.hour + 1) : status.label.replace(/^Screen off air, back at /, "Back at ").replace(/^Screen off air, hours not set$/, "Hours not set")}</strong><p>{error ? "Schedule unavailable. Check approved adverts." : status.onAir ? "Scheduled: " + label(playlist.current) : "The screen is off air right now."}</p><small>Planned playback, not a live screen feed.</small></div><div className="screen-next">{status.onAir && !error && <><span>Next: {label(playlist.next)}</span>{playlist.current && <span>{playlist.current.seconds}s current item</span>}</>}</div></div><div className="screen-now-ring"><Ring value={shares.find((entry) => entry.hour === clock.hour)?.share ?? 0} label="this hour sold" small /></div></section>;
}
