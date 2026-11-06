"use client";
import { useEffect, useState } from "react";
import { onAirStatus } from "@/lib/dashboard";
import type { BookingSettings } from "@/lib/booking/settings";
// chip: the compact top bar status (2026-11-05). Live shows moving bars; off air shows a still grey dot.
export default function OnAir({ settings, now, variant = "text" }: { settings: BookingSettings; now: string; variant?: "text" | "chip" }) {
  const [clock, setClock] = useState(now);
  useEffect(() => { const timer = setInterval(() => setClock(new Date().toISOString()), 15000); return () => clearInterval(timer); }, []);
  const status = onAirStatus(settings, new Date(clock));
  if (variant === "chip") return <span className="on-air-chip" data-live={status.onAir} title={status.label} role="status">
    {status.onAir ? <span className="on-air-bars" aria-hidden="true"><i /><i /><i /></span> : <span className="on-air-off" aria-hidden="true" />}
    <span>{status.onAir ? "On air" : status.label.replace(/^Screen off air, /, "Off air, ")}</span>
  </span>;
  return <span className="on-air" data-live={status.onAir}>{status.onAir && <i aria-hidden="true" />}{status.label}</span>;
}
