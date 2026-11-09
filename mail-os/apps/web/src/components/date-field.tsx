"use client";

import { CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/format";

/**
 * The browser draws a date input in the computer's own format, such as 11/09/2026.
 * This shows the app's format instead and lays the real input invisibly on top, so
 * clicking, the calendar and the keyboard all still work.
 */
export function DateField({ value, compact = false, ...props }: Omit<React.ComponentProps<"input">, "type" | "value"> & {
  value: string; compact?: boolean;
}) {
  return <span className="date-field" data-compact={compact || undefined}>
    <span aria-hidden="true">{formatDate(value, "Choose a date")}</span>
    <CalendarDays size={14} aria-hidden="true" />
    <input type="date" value={value} {...props} />
  </span>;
}
