"use client";
import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { STATUSES } from "@/lib/booking/status";
import type { BookingFilter } from "@/lib/store/types";
export default function BookingFilters({ filter, children }: { filter: BookingFilter; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <>
    <form method="get" className="staff-form mb-6 grid items-end gap-3 sm:grid-cols-4" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const query = new URLSearchParams();
      for (const name of ["status", "from", "to"]) { const value = String(data.get(name) ?? ""); if (value) query.set(name, value); }
      startTransition(() => router.push(`/manage?${query}`));
    }}>
      <label>Status<select name="status" defaultValue={filter.status ?? ""}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>From<input type="date" name="from" defaultValue={filter.from} /></label>
      <label>To<input type="date" name="to" defaultValue={filter.to} /></label>
      <button className="staff-button" disabled={pending}>Filter bookings</button>
    </form>
    <div className="staff-results" data-pending={pending} aria-busy={pending}>{children}</div>
  </>;
}
