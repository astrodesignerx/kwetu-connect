"use client";
import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { STATUSES } from "@/lib/booking/status";
import type { BookingFilter } from "@/lib/store/types";
import Link from "next/link";
export default function BookingFilters({ filter, children }: { filter: BookingFilter; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <>
    <nav className="status-filters" aria-label="Filter by status">{["", ...STATUSES].map((status) => {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (filter.from) query.set("from", filter.from);
      if (filter.to) query.set("to", filter.to);
      return <Link key={status} href={`/manage/bookings?${query}`} aria-current={(filter.status ?? "") === status ? "page" : undefined}>{status || "All"}</Link>;
    })}</nav>
    <form method="get" action="/manage/bookings" className="staff-form mb-6 grid items-end gap-3 sm:grid-cols-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const query = new URLSearchParams();
      for (const name of ["status", "from", "to"]) { const value = String(data.get(name) ?? ""); if (value) query.set(name, value); }
      startTransition(() => router.push(`/manage/bookings?${query}`));
    }}>
      <input type="hidden" name="status" value={filter.status ?? ""} />
      <label>From<input type="date" name="from" defaultValue={filter.from} /></label>
      <label>To<input type="date" name="to" defaultValue={filter.to} /></label>
      <button className="staff-button" disabled={pending}>Filter bookings</button>
    </form>
    <div className="staff-results" data-pending={pending} aria-busy={pending}>{children}</div>
  </>;
}
