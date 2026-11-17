"use client";
import { useEffect, useState } from "react";

// "Mon 9 Nov 18:42" in Nairobi time.
function nairobiStamp(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).replace(",", "");
  return day + " " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Nairobi" });
}

/** Today's date and the time in Nairobi, refreshed every 30 seconds. */
export default function ClockPill({ now, className = "" }: { now: string; className?: string }) {
  const [clock, setClock] = useState(now);
  useEffect(() => { const timer = setInterval(() => setClock(new Date().toISOString()), 30000); return () => clearInterval(timer); }, []);
  return <span className={"mg-pill mg-clock " + className}><span className="mg-live-dot" aria-hidden="true" /><time dateTime={clock}>{nairobiStamp(clock)}</time></span>;
}
