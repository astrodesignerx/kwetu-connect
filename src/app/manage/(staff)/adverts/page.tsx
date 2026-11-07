import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import AdvertReview from "@/components/manage/AdvertReview";
import { ActionForm } from "@/components/manage/ActionForm";
import { uploadAdvert } from "@/app/manage/actions";
import StatusControls from "@/components/manage/StatusControls";
import { todayInNairobi } from "@/lib/store/validation";
import type { Advert, BookingDetail } from "@/lib/store/types";

const FILTERS = ["waiting", "approved", "refused", "missing", "all"] as const;
const LABELS = { waiting: "To review", approved: "Approved", refused: "Refused", missing: "Missing", all: "All" };

export default async function AdvertsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filter = FILTERS.find((value) => value === read("filter")) ?? "waiting";
  const query = read("q").slice(0, 150).toLowerCase();
  const store = getStore();
  const [bookings, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  const details = (await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status) && (!query || `${booking.reference} ${booking.business} ${booking.paymentNote}`.toLowerCase().includes(query))).map((booking) => store.bookingDetail(booking.reference)))).filter((detail) => detail !== null);
  const entries = details.flatMap<{ detail: BookingDetail; advert: Advert | null }>((detail) => detail.adverts.length ? detail.adverts.map((advert) => ({ detail, advert })) : [{ detail, advert: null }]);
  const matches = (entry: typeof entries[number], value: typeof filter) => value === "all" || (value === "missing" ? !entry.advert : entry.advert?.decision === value);
  const visible = entries.filter((entry) => matches(entry, filter));
  const selected = visible.find((entry) => entry.detail.booking.reference === read("selected") && (entry.advert?.id ?? "") === read("id")) ?? visible[0];
  const href = (value: typeof filter, reference?: string, id?: string) => {
    const values = new URLSearchParams({ filter: value });
    if (query) values.set("q", query);
    if (reference) values.set("selected", reference);
    if (id) values.set("id", id);
    return "/manage/adverts?" + values;
  };
  return <section className="pipeline-page advert-desk"><div className="pipeline-heading"><div><p className="eyebrow">One advert at a time</p><h1>Advert review desk</h1></div><Link href="/manage/bookings" className="quiet-button">Open pipeline</Link></div>
    <nav className="status-filters" aria-label="Advert queue">{FILTERS.map((value) => <Link href={href(value)} key={value} aria-current={filter === value ? "page" : undefined}>{LABELS[value]}<span>{entries.filter((entry) => matches(entry, value)).length}</span></Link>)}</nav>
    <form method="get" className="staff-form advert-search"><input type="hidden" name="filter" value={filter} /><label>Reference, business or M-Pesa code<input name="q" type="search" defaultValue={read("q")} maxLength={150} /></label><button type="submit" className="quiet-button">Search</button></form>
    {!selected && <div className="ns-card empty-state"><h2>{query ? "No adverts match your search" : filter === "waiting" ? "The review queue is clear" : "Nothing in this queue"}</h2><p>Choose another queue to see approved files, refused files or bookings missing an advert.</p><Link className="quiet-button" href={href("all")}>See all open bookings</Link></div>}
    <div className="v2-review-workspace">
    {visible.length > 0 && <nav className="review-queue" aria-label="Choose an advert">{visible.map(({ detail, advert }, index) => <Link className="review-queue-item" href={href(filter, detail.booking.reference, advert?.id)} key={advert?.id ?? detail.booking.reference} aria-current={selected?.detail.booking.reference === detail.booking.reference && selected?.advert?.id === advert?.id ? "true" : undefined}><span className="review-queue-number">{String(index + 1).padStart(2, "0")}</span><strong>{detail.advertiser.business}</strong><span>{advert ? `${advert.seconds}s / ${advert.decision}` : "No file yet"}</span><small>{advert?.fileName ?? detail.booking.reference}</small></Link>)}</nav>}
    {selected && <div key={selected.advert?.id ?? selected.detail.booking.reference} className="review-selection"><div className="pipeline-heading"><div><h2>{selected.detail.advertiser.business}</h2><p className="pipeline-help">{selected.detail.booking.reference} / {selected.detail.booking.status} / {selected.detail.booking.request.startDate} to {selected.detail.booking.request.endDate}</p></div><Link className="quiet-button" href={"/manage/bookings/" + selected.detail.booking.reference}>Open booking</Link></div>
      {selected.advert ? <AdvertReview advert={selected.advert} reference={selected.detail.booking.reference} bookedSeconds={selected.detail.booking.request.lengthSeconds} demo={store.mode === "memory"} /> : <section className="ns-card missing-advert"><h2>No advert uploaded yet</h2><p>Add the customer&apos;s file to this booking. The new file will enter the review queue.</p><ActionForm action={uploadAdvert} submit="Upload advert"><input type="hidden" name="reference" value={selected.detail.booking.reference} /><label>Advert file (MP4, PNG or JPEG, up to 50 MB)<input type="file" name="file" accept="video/mp4,image/png,image/jpeg" required /></label><label>Length in seconds<input type="number" name="seconds" min={1} max={3600} step={1} required defaultValue={selected.detail.booking.request.lengthSeconds} /></label></ActionForm></section>}
      <details className="staff-card review-booking-status"><summary>Booking status: {selected.detail.booking.status}</summary><StatusControls key={selected.detail.booking.updatedAt} detail={selected.detail} settings={settings} today={todayInNairobi()} /></details>
    </div>}
    </div>
  </section>;
}
