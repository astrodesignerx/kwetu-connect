import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import { isValidDate } from "@/lib/booking/hours";
import BookingFilters from "@/components/manage/BookingFilters";
import BookingDetail from "@/components/manage/BookingDetail";
import PipelineBoard, { PipelineInspector } from "@/components/manage/PipelineBoard";
import PipelineMove from "@/components/manage/PipelineMove";
import { todayInNairobi } from "@/lib/store/validation";
import { redirect } from "next/navigation";
import { number } from "@/components/booking/QuoteTotals";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  if (read("adverts") === "1") redirect("/manage/adverts" + (read("q") ? "?q=" + encodeURIComponent(read("q")) : ""));
  const filter = { status: STATUSES.find((status) => status === read("status")), from: isValidDate(read("from")) ? read("from") : "", to: isValidDate(read("to")) ? read("to") : "", q: read("q").slice(0, 150), adverts: false };
  const store = getStore();
  const [all, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const query = filter.q.toLowerCase();
  const matching = all.filter((booking) => (!filter.from || booking.request.endDate >= filter.from) && (!filter.to || booking.request.startDate <= filter.to) && (!query || booking.reference.toLowerCase().includes(query) || booking.business.toLowerCase().includes(query) || booking.paymentNote.toLowerCase().includes(query)));
  const counts = Object.fromEntries(["", ...STATUSES].map((status) => [status, matching.filter((booking) => !status || booking.status === status).length]));
  const bookings = matching.filter((booking) => !filter.status || booking.status === filter.status);
  const details = await Promise.all(bookings.map((booking) => store.bookingDetail(booking.reference)));
  const detail = details.find((item) => item?.booking.reference === read("selected"));
  const values = new URLSearchParams();
  for (const key of ["status", "from", "to", "q"]) if (read(key)) values.set(key, read(key));
  const target = STATUSES.find((stage) => stage === read("moveTo"));
  const cards = bookings.map((booking, index) => ({ ...booking, advertCount: details[index]?.adverts.length ?? 0, waiting: details[index]?.adverts.filter((ad) => ad.decision === "waiting").length ?? 0, approved: details[index]?.adverts.filter((ad) => ad.decision === "approved").length ?? 0 }));
  return <section className="pipeline-page"><div className="pipeline-heading"><div className="bookings-title"><p className="eyebrow">From quote to screen</p><h1>Booking pipeline</h1><p>KES {number(all.filter((booking) => booking.status !== "Cancelled").reduce((total, booking) => total + booking.priceKes, 0))} booked / cancelled excluded</p></div><Link href="/manage/adverts" className="quiet-button">Open advert desk</Link></div>
    <p className="pipeline-help">Open a card to view details and change status. You can also drag a card to a stage, then confirm the move.</p>
    <BookingFilters key={JSON.stringify(filter)} filter={filter} counts={counts}>
      {filter.from && filter.to && filter.from > filter.to && <p role="alert">The end date is before the start date.</p>}
      <PipelineBoard bookings={cards} query={values.toString()} selected={read("selected")} status={filter.status} />
      {!bookings.length && <div className="ns-card empty-state">No bookings match these filters.</div>}
    </BookingFilters>
    {detail && <PipelineInspector title={detail.advertiser.business} closeUrl={"/manage/bookings?" + values} reference={detail.booking.reference}>
      {target && <PipelineMove key={detail.booking.reference + target} detail={detail} target={target} settings={settings} today={todayInNairobi()} />}
      <BookingDetail detail={detail} settings={settings} demo={store.mode === "memory"} compact />
    </PipelineInspector>}
  </section>;
}
