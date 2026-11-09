"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarBlank, CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { activeMonth, monthBounds, monthLabel, shiftMonth, type PipelineFilters, type PipelineView } from "@/lib/booking/pipeline";

export type FilterCounts = { all: number; needs: number; week: number; ending: number };
const CHIPS: { view?: PipelineView; label: string; key: keyof FilterCounts }[] = [
  { label: "All", key: "all" }, { view: "needs", label: "Needs action", key: "needs" }, { view: "week", label: "Starting this week", key: "week" }, { view: "ending", label: "Ending this month", key: "ending" },
];

export default function BookingFilters({ filter, counts, today, children }: { filter: PipelineFilters; counts: FilterCounts; today: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const month = useRef<HTMLDivElement>(null);
  const applied = activeMonth(filter.from, filter.to);
  // With no month applied the chip still names the current month, so Show this month is one click.
  const shown = applied ?? (filter.from ? filter.from.slice(0, 7) : today.slice(0, 7));
  // Every control keeps the others: search, dates, view, hide and layout. A new filter closes any open booking.
  const href = (change: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const next: Record<string, string | undefined> = { q: filter.q, from: filter.from, to: filter.to, status: filter.status, view: filter.view, hide: filter.hide ? "finished" : "", layout: filter.layout === "list" ? "list" : "", ...change };
    for (const [name, value] of Object.entries(next)) if (value) query.set(name, value);
    const text = query.toString();
    return "/manage/bookings" + (text ? "?" + text : "");
  };
  const monthHref = (value: string) => { const bounds = monthBounds(value); return href({ from: bounds.from, to: bounds.to }); };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!month.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); month.current?.querySelector<HTMLButtonElement>(".v2-month-chip")?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <><div className="pipeline-toolbar v2-filter-bar">
    <form method="get" action="/manage/bookings" className="v2-filter-search" role="search">
      {(["from", "to", "status", "view", "layout"] as const).map((name) => { const value = name === "layout" ? (filter.layout === "list" ? "list" : "") : filter[name]; return value ? <input key={name} type="hidden" name={name} value={value} /> : null; })}
      {filter.hide && <input type="hidden" name="hide" value="finished" />}
      <label><MagnifyingGlass size={15} aria-hidden="true" /><input key={filter.q} type="search" name="q" defaultValue={filter.q} placeholder="Business or reference" aria-label="Search by business or reference" maxLength={150} /></label>
    </form>
    <nav className="v2-chips" aria-label="Quick views">{CHIPS.map((chip) => <Link key={chip.label} href={href({ view: chip.view })} scroll={false} aria-current={(filter.view ?? undefined) === chip.view ? "page" : undefined}>{chip.view === "needs" && <i className="v2-chip-dot" aria-hidden="true" />}{chip.label}<span>{counts[chip.key]}</span></Link>)}</nav>
    <div className="v2-month" ref={month}>
      <button type="button" className="v2-month-chip" aria-expanded={open} aria-haspopup="dialog" data-applied={!!applied} onClick={() => setOpen((value) => !value)}><CalendarBlank size={14} aria-hidden="true" />{monthLabel(shown)}</button>
      {open && <div className="v2-month-pop" role="dialog" aria-label="Choose a month">
        <Link href={monthHref(shiftMonth(shown, -1))} scroll={false} className="v2-month-step" aria-label="Previous month"><CaretLeft size={14} aria-hidden="true" /></Link>
        <Link href={monthHref(shown)} scroll={false} className="v2-month-apply" aria-current={applied === shown ? "true" : undefined}>{applied === shown ? monthLabel(shown) : "Show " + monthLabel(shown)}</Link>
        <Link href={monthHref(shiftMonth(shown, 1))} scroll={false} className="v2-month-step" aria-label="Next month"><CaretRight size={14} aria-hidden="true" /></Link>
        {(filter.from || filter.to) && <Link href={href({ from: "", to: "" })} scroll={false} className="v2-month-clear">Clear</Link>}
      </div>}
    </div>
    <button type="button" role="switch" aria-checked={filter.hide} className="v2-hide-switch" disabled={pending} onClick={() => startTransition(() => router.push(href({ hide: filter.hide ? "" : "finished" }), { scroll: false }))}><span>Hide finished</span><i aria-hidden="true" /></button>
  </div><div className="staff-results" data-pending={pending} aria-busy={pending}>{children}</div></>;
}
