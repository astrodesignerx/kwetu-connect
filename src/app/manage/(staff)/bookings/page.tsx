import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import { isValidDate } from "@/lib/booking/hours";
import BookingFilters from "@/components/manage/BookingFilters";
import StatusTag from "@/components/manage/StatusTag";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filter = { status: STATUSES.find((s) => s === read("status")), from: isValidDate(read("from")) ? read("from") : "", to: isValidDate(read("to")) ? read("to") : "" };
  const bookings = await getStore().listBookings(filter);
  return <section className="space-y-5"><h1 className="text-2xl font-bold">Bookings</h1>
    <BookingFilters key={JSON.stringify(filter)} filter={filter}>
      <div className="staff-card animate-quote-in">
        <p className="mb-4 text-sm text-gray-600">{bookings.length} bookings, newest first. Dates match any part of a booking.</p>
        {filter.from && filter.to && filter.from > filter.to && <p role="alert">The end date is before the start date.</p>}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Bookings table"><table className="booking-table"><thead><tr>{["Status", "Business", "Reference", "Plays", "KES", "Starts"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{bookings.map((b) => <tr key={b.reference}>
            <td><StatusTag status={b.status} /></td><td><Link href={`/manage/bookings/${b.reference}`}>{b.business}</Link></td>
            <td><Link className="reference-link" href={`/manage/bookings/${b.reference}`}>{b.reference}</Link></td>
            <td>{b.plays.toLocaleString("en-GB")}</td><td>{b.priceKes.toLocaleString("en-GB")}</td><td className="whitespace-nowrap">{b.request.startDate}</td>
          </tr>)}</tbody></table></div>
        {!bookings.length && <p className="py-8 text-sm text-gray-600">No bookings match these filters.</p>}
      </div>
    </BookingFilters>
  </section>;
}
