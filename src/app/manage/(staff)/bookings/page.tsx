import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import { isValidDate } from "@/lib/booking/hours";
import BookingFilters from "@/components/manage/BookingFilters";
import StatusTag from "@/components/manage/StatusTag";
import BookingDetail from "@/components/manage/BookingDetail";
import { number } from "@/components/booking/QuoteTotals";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filter = { status: STATUSES.find((status) => status === read("status")), from: isValidDate(read("from")) ? read("from") : "", to: isValidDate(read("to")) ? read("to") : "", q: read("q").slice(0, 150), adverts: read("adverts") === "1" };
  const store = getStore();
  const [all, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const query = filter.q.toLowerCase();
  let matching = all.filter((booking) => (!filter.from || booking.request.endDate >= filter.from) && (!filter.to || booking.request.startDate <= filter.to) && (!query || booking.reference.toLowerCase().includes(query) || booking.business.toLowerCase().includes(query)));
  if (filter.adverts) {
    const details = await Promise.all(matching.filter((booking) => booking.status === "Paid").map((booking) => store.bookingDetail(booking.reference)));
    const references = new Set(details.filter((detail) => detail && !detail.adverts.some((advert) => advert.decision === "approved")).map((detail) => detail!.booking.reference));
    matching = matching.filter((booking) => references.has(booking.reference));
  }
  const counts = Object.fromEntries(["", ...STATUSES].map((status) => [status, matching.filter((booking) => !status || booking.status === status).length]));
  const bookings = matching.filter((booking) => !filter.status || booking.status === filter.status);
  const selected = bookings.find((booking) => booking.reference === read("selected")) ?? bookings[0];
  const detail = selected ? await store.bookingDetail(selected.reference) : null;
  const selectionUrl = (reference: string) => {
    const values = new URLSearchParams();
    for (const key of ["status", "from", "to", "q", "adverts"]) if (read(key)) values.set(key, read(key));
    values.set("selected", reference);
    return "/manage/bookings?" + values;
  };
  return <section className="bookings-split"><div className="booking-list-pane"><div className="bookings-title"><h1>Bookings</h1><p>KES {number(all.filter((booking) => booking.status !== "Cancelled").reduce((total, booking) => total + booking.priceKes, 0))} booked / cancelled excluded</p></div>
    <BookingFilters key={JSON.stringify(filter)} filter={filter} counts={counts}>
      {filter.from && filter.to && filter.from > filter.to && <p role="alert">The end date is before the start date.</p>}
      <div className="booking-list" aria-label="Bookings">{bookings.map((booking) => <Link key={booking.reference} href={selectionUrl(booking.reference)} className="booking-list-row" aria-current={selected?.reference === booking.reference ? "true" : undefined}><span className="business-avatar" aria-hidden="true">{booking.business.slice(0, 2).toUpperCase()}</span><div className="booking-list-business"><strong>{booking.business}</strong><small className="reference-link">{booking.reference}</small><small>{booking.request.lengthSeconds}s / {booking.request.startDate} to {booking.request.endDate}</small></div><StatusTag status={booking.status} /><span className="booking-list-price">KES {number(booking.priceKes)}<small>{number(booking.plays)} plays</small></span></Link>)}</div>
      {!bookings.length && <div className="ns-card empty-state">No bookings match these filters.</div>}
    </BookingFilters></div><aside className="booking-detail-panel" aria-label="Selected booking" key={selected?.reference}>{detail ? <><Link className="quiet-button" href={"/manage/bookings/" + detail.booking.reference}>Open full booking</Link><BookingDetail detail={detail} settings={settings} demo={store.mode === "memory"} /></> : <p className="empty-state">Select a booking to see the advert, payment and history.</p>}</aside></section>;
}
