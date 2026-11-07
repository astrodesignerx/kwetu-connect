"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CalendarBlank, CaretLeft, CaretRight, MagnifyingGlass, Plus, SidebarSimple } from "@phosphor-icons/react";
import { usePathname, useSearchParams } from "next/navigation";
import ThemeSwitch from "@/components/workspace/ThemeSwitch";
import { Input } from "@/components/ui/input";
import { addDays, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { useSidebar } from "./useSidebar";

const TITLES: [string, string][] = [["/manage/bookings", "Bookings"], ["/manage/adverts", "Adverts"], ["/manage/schedule", "Schedule"], ["/manage/settings", "Settings"]];
function weekLabel(monday: string) {
  const sunday = addDays(monday, 6);
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  return (sameMonth ? part(monday, { day: "numeric" }) : part(monday, { day: "numeric", month: "short" })) + " to " + part(sunday, { day: "numeric", month: "short", year: "numeric" });
}

export default function ManagerTopbar({ today, now, notices }: { today: string; now: string; notices: number }) {
  const search = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  const pathname = usePathname();
  const { open, toggle } = useSidebar();
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.current?.focus(); } };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const title = params.get("adverts") === "1" ? "Adverts" : TITLES.find(([path]) => pathname.startsWith(path))?.[1] ?? "Overview";
  const overview = pathname === "/manage";
  const week = params.get("week");
  const date = week && isValidDate(week) ? week : today;
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  const thisMonday = addDays(today, -((weekdayOf(today) + 6) % 7));
  return <header className="manager-topbar">
    <button type="button" className="sidebar-toggle" aria-controls="manager-sidebar" aria-expanded={open} aria-label={open ? "Close sidebar" : "Open sidebar"} title={open ? "Close sidebar" : "Open sidebar"} onClick={toggle}><SidebarSimple size={18} aria-hidden="true" /></button>
    <span className="sr-only">{title}</span>
    <form action="/manage/bookings" className="manager-search" role="search">
      <label><MagnifyingGlass size={16} aria-hidden="true" /><Input ref={search} key={params.get("q")} name="q" aria-label="Search bookings by reference, business or M-Pesa code" placeholder="Search bookings, references, M-Pesa codes" defaultValue={params.get("q") ?? ""} /></label>
      <kbd>Ctrl K</kbd><button type="submit" className="sr-only focus:not-sr-only">Search</button>
    </form>
    <span className="v2-topbar-space" />
    <span className="v2-datechip"><CalendarBlank size={15} aria-hidden="true" /><b>{new Date(now).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" })}</b></span>
    <ThemeSwitch variant="icons" />
    <Link href="/manage/adverts" className="v2-notifications" aria-label={notices ? `${notices} adverts waiting for review` : "No adverts waiting for review"}><Bell size={17} aria-hidden="true" />{notices > 0 && <i />}</Link>
    <Link href="/book" className="new-quote-button"><Plus size={14} weight="bold" aria-hidden="true" />New quote</Link>
    {overview && <nav className="week-picker" aria-label="Choose week">
      <Link href={"/manage?week=" + addDays(monday, -7)} aria-label="Previous week"><CaretLeft size={14} aria-hidden="true" /></Link>
      <Link href="/manage" aria-label={monday === thisMonday ? "This week, " + weekLabel(monday) : "Back to this week, showing " + weekLabel(monday)} aria-current={monday === thisMonday ? "date" : undefined}>{weekLabel(monday)}</Link>
      <Link href={"/manage?week=" + addDays(monday, 7)} aria-label="Next week"><CaretRight size={14} aria-hidden="true" /></Link>
    </nav>}
  </header>;
}
