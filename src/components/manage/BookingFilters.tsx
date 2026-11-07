"use client";
import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { STATUSES } from "@/lib/booking/status";
import type { BookingFilter } from "@/lib/store/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function BookingFilters({ filter, counts, children }: { filter: BookingFilter & { q: string; adverts: boolean }; counts: Record<string, number>; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const base = () => {
    const query = new URLSearchParams();
    if (filter.from) query.set("from", filter.from);
    if (filter.to) query.set("to", filter.to);
    if (filter.q) query.set("q", filter.q);
    if (filter.adverts) query.set("adverts", "1");
    return query;
  };
  return <><nav className="status-filters" aria-label="Filter by status">{["", ...STATUSES].map((status) => {
    const query = base();
    if (status) query.set("status", status);
    return <Link key={status} href={"/manage/bookings?" + query} aria-current={(filter.status ?? "") === status ? "page" : undefined}>{status || "All"} <span>{counts[status] ?? 0}</span></Link>;
  })}</nav><form method="get" action="/manage/bookings" className="staff-form booking-filter-form v2-filter-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const name of ["status", "from", "to", "q", "adverts"]) { const value = String(data.get(name) ?? ""); if (value) query.set(name, value); }
    startTransition(() => router.push("/manage/bookings?" + query));
  }}><input type="hidden" name="status" value={filter.status ?? ""} />{filter.adverts && <input type="hidden" name="adverts" value="1" />}<label>Reference, business or payment code<Input name="q" placeholder="Search bookings" defaultValue={filter.q} type="search" maxLength={150} /></label><label>From<Input type="date" name="from" defaultValue={filter.from} /></label><label>To<Input type="date" name="to" defaultValue={filter.to} /></label><Button disabled={pending}>{pending ? "Filtering..." : "Filter"}</Button>{(filter.q || filter.from || filter.to || filter.status) && <Link href="/manage/bookings" className="quiet-button">Clear</Link>}</form><div className="staff-results" data-pending={pending} aria-busy={pending}>{children}</div></>;
}
