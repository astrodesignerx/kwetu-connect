"use client";
import { useEffect, useState } from "react";
import { onAirStatus } from "@/lib/dashboard";
import type { BookingSettings } from "@/lib/booking/settings";
export default function OnAir({ settings, now }: { settings: BookingSettings; now: string }) {
  const [clock, setClock] = useState(now);
  useEffect(() => { const timer = setInterval(() => setClock(new Date().toISOString()), 15000); return () => clearInterval(timer); }, []);
  const status = onAirStatus(settings, new Date(clock));
  return <span className="on-air" data-live={status.onAir}>{status.onAir && <i aria-hidden="true" />}{status.label}</span>;
}
