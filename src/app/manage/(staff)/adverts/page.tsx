import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import AdvertReview from "@/components/manage/AdvertReview";
import AdvertQueue from "@/components/manage/AdvertQueue";
import AdvertBookingCard, { type BookingFacts } from "@/components/manage/AdvertBookingCard";
import AdvertCardHead from "@/components/manage/AdvertCardHead";
import { ActionForm } from "@/components/manage/ActionForm";
import { uploadAdvert } from "@/app/manage/actions";
import { number } from "@/components/booking/QuoteTotals";
import { scheduleLines } from "@/lib/booking/selection";
import { todayInNairobi } from "@/lib/store/validation";
import { dateRange, shortDate } from "@/lib/format/dates";
import { SCREEN } from "@/lib/advert-checks";
import { DESK_FILTERS, groupQueue, matchesFilter, nairobiDay, type DeskEntry, type DeskFilter } from "@/lib/advert-desk";
import type { BookingSettings } from "@/lib/booking/settings";
import type { BookingDetail } from "@/lib/store/types";

function factsOf(detail: BookingDetail, settings: BookingSettings): BookingFacts {
  const { booking: b } = detail;
  const kes = "KES " + number(b.priceKes);
  return { reference: b.reference, dates: dateRange(b.request.startDate, b.request.endDate), plan: number(b.plays) + " plays, " + b.request.lengthSeconds + "s", lines: scheduleLines(b.request, settings.timeBlocks), payment: b.status === "Quote" ? "Unpaid, quote " + kes : "Paid " + kes };
}

export default async function AdvertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filter: DeskFilter = DESK_FILTERS.find((value) => value === read("filter")) ?? "waiting";
  const query = read("q").slice(0, 150).toLowerCase();
  const today = todayInNairobi();
  const store = getStore();
  const [bookings, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const details = (await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status) && (!query || `${booking.reference} ${booking.business} ${booking.paymentNote}`.toLowerCase().includes(query))).map((booking) => store.bookingDetail(booking.reference)))).filter((detail) => detail !== null);
  const entries = details.flatMap<DeskEntry>((detail) => detail.adverts.length ? detail.adverts.map((advert) => ({ detail, advert })) : [{ detail, advert: null }]);
  const counts = { waiting: entries.filter((entry) => matchesFilter(entry, "waiting")).length, missing: entries.filter((entry) => matchesFilter(entry, "missing")).length, approved: entries.filter((entry) => matchesFilter(entry, "approved")).length, refused: entries.filter((entry) => matchesFilter(entry, "refused")).length };
  const groups = groupQueue(entries, filter);
  const visible = groups.flatMap((group) => group.items);
  const keyOf = (entry: DeskEntry) => entry.detail.booking.reference + "/" + (entry.advert?.id ?? "");
  const selected = visible.find((entry) => entry.detail.booking.reference === read("selected") && (entry.advert?.id ?? "") === read("id")) ?? visible[0];
  const href = (value: DeskFilter, reference?: string, id?: string) => {
    const values = new URLSearchParams({ filter: value });
    if (query) values.set("q", query);
    if (reference) values.set("selected", reference);
    if (id) values.set("id", id);
    return "/manage/adverts?" + values;
  };
  const detail = selected?.detail;
  return <section className="pipeline-page advert-desk">
    <div className="pipeline-heading">
      <p className="pipeline-help">Check each advert before it reaches the screen | {counts.waiting} to review, {counts.missing} missing</p>
      <span className="advert-screen-chip">Screen {SCREEN.width} x {SCREEN.height} px, 16:9, no sound</span>
    </div>
    <div className="advert-grid">
      <AdvertQueue groups={groups} counts={counts} filter={filter} selectedKey={selected ? keyOf(selected) : ""} today={today} href={href} />
      {!selected && <div className="v2-card empty-state advert-empty"><h2>{query ? "No adverts match your search" : filter === "waiting" ? "The review queue is clear" : "Nothing in this queue"}</h2><p>Choose another tab to see approved files, refused files or bookings missing an advert.</p><Link className="quiet-button" href={href("all")}>See all open bookings</Link></div>}
      {selected && detail && (selected.advert
        ? <AdvertReview key={selected.advert.id} advert={selected.advert} reference={detail.booking.reference} business={detail.advertiser.business} bookedSeconds={detail.booking.request.lengthSeconds} demo={store.mode === "memory"} uploaded={shortDate(nairobiDay(selected.advert.createdAt))} facts={factsOf(detail, settings)} paidWithApproved={detail.booking.status === "Paid" && detail.adverts.some((advert) => advert.decision === "approved")} />
        : <>
          <section key={detail.booking.reference} className="v2-card advert-card advert-preview-card" aria-label="Upload an advert">
            <AdvertCardHead business={detail.advertiser.business} reference={detail.booking.reference} downloadUrl={null} fileName="" facts={"No file yet, " + (detail.booking.status === "Quote" ? "quote" : "paid")} />
            <div className="advert-upload"><h3>No advert uploaded yet</h3><p>Add the customer&apos;s file to this booking. The new file will enter the review queue.</p>
              <ActionForm action={uploadAdvert} submit="Upload advert"><input type="hidden" name="reference" value={detail.booking.reference} /><label>Advert file (MP4, PNG or JPEG, up to 50 MB)<input type="file" name="file" accept="video/mp4,image/png,image/jpeg" required /></label><label>Length in seconds<input type="number" name="seconds" min={1} max={3600} step={1} required defaultValue={detail.booking.request.lengthSeconds} /></label></ActionForm></div>
          </section>
          <section className="v2-card advert-card advert-checks-card" aria-label="Booking"><AdvertBookingCard facts={factsOf(detail, settings)} /></section>
        </>)}
    </div>
  </section>;
}
