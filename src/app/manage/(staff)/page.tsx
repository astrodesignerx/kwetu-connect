import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import { isValidDate } from "@/lib/booking/hours";
import BookingFilters from "@/components/manage/BookingFilters";
export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filter = { status: STATUSES.find((s) => s === read("status")), from: isValidDate(read("from")) ? read("from") : "", to: isValidDate(read("to")) ? read("to") : "" };
  const bookings = await getStore().listBookings(filter);
  return <section className="space-y-5"><h1 className="text-2xl font-bold">Bookings</h1>
    <BookingFilters key={JSON.stringify(filter)} filter={filter}>
      <div className="animate-quote-in space-y-3 motion-reduce:animate-none">
        <p className="text-sm text-gray-300">{bookings.length} bookings, newest first. Dates match any part of a booking.</p>
        {filter.from && filter.to && filter.from > filter.to && <p role="alert">The end date is before the start date.</p>}
        {bookings.map((b) => <Link className="staff-card block transition-opacity duration-200 ease-out hover:opacity-80 motion-reduce:transition-none" key={b.reference} href={`/manage/bookings/${b.reference}`}>
          <div className="flex flex-wrap justify-between gap-2"><strong className="break-all text-brand-500">{b.reference}</strong><span>{b.status}</span></div>
          <p className="mt-2 font-semibold">{b.business}</p><p className="mt-1 text-sm text-gray-300">{b.request.startDate} to {b.request.endDate}</p>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><span>{b.plays.toLocaleString("en-GB")} plays</span><span>KES {b.priceKes.toLocaleString("en-GB")}</span></div>
        </Link>)}
        {!bookings.length && <p className="staff-card">No bookings match these filters.</p>}
      </div>
    </BookingFilters>
  </section>;
}
