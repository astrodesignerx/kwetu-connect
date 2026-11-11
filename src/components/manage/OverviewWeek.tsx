import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { addDays } from "@/lib/booking/hours";

// "9 to 15 Nov 2026", or "30 Nov to 6 Dec 2026" across a month end.
function weekLabel(monday: string) {
  const sunday = addDays(monday, 6);
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return (sameMonth ? part(monday, { day: "numeric" }) : part(monday, { day: "numeric", month: "short" })) + " to " + part(sunday, { day: "numeric", month: "short", year: "numeric" });
}

/** The Overview's week pill: previous week, the shown week (back to this week), next week. */
export default function OverviewWeek({ monday, thisMonday }: { monday: string; thisMonday: string }) {
  return <nav className="mg-week" aria-label="Choose week">
    <Link href={"/manage?week=" + addDays(monday, -7)} aria-label="Previous week"><CaretLeft size={12} aria-hidden="true" /></Link>
    <Link href="/manage" aria-label={monday === thisMonday ? "This week, " + weekLabel(monday) : "Back to this week, showing " + weekLabel(monday)} aria-current={monday === thisMonday ? "date" : undefined}>{weekLabel(monday)}</Link>
    <Link href={"/manage?week=" + addDays(monday, 7)} aria-label="Next week"><CaretRight size={12} aria-hidden="true" /></Link>
  </nav>;
}
