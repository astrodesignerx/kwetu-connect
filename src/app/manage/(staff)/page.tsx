import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { addDays, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { BLOCK_ORDER, DAY_ORDER } from "@/lib/booking/selection";
import Timetable, { TimetableLegend } from "@/components/booking/Timetable";
import StatusTag from "@/components/manage/StatusTag";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireStaff();
  const params = await searchParams;
  const date = typeof params.week === "string" && isValidDate(params.week) ? params.week : todayInNairobi();
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  const sunday = addDays(monday, 6);
  const store = getStore();
  const [settings, occupancy, bookings] = await Promise.all([store.getSettings(), store.occupancy(monday, sunday), store.listBookings()]);
  let soldHours = 0;
  let openHours = 0;
  for (const day of DAY_ORDER) for (const id of BLOCK_ORDER) {
    const block = settings.timeBlocks[id];
    const screen = settings.screenHours[day];
    if (!screen) continue;
    const hours = Math.max(0, Math.min(screen.close, block.endHour) - Math.max(screen.open, block.startHour));
    openHours += hours;
    soldHours += hours * occupancy[day][id].soldShare;
  }
  const paidDetails = await Promise.all(bookings.filter((b) => b.status === "Paid").map((b) => store.bookingDetail(b.reference)));
  const needsAdvert = new Set(paidDetails.filter((d) => d && !d.adverts.some((a) => a.decision === "approved")).map((d) => d!.booking.reference));
  const needs = bookings.filter((b) => needsAdvert.has(b.reference) || b.status === "Quote").sort((a, b) => {
    const priority = (item: typeof a) => needsAdvert.has(item.reference) ? 0 : item.paymentNote ? 1 : 2;
    return priority(a) - priority(b) || a.request.startDate.localeCompare(b.request.startDate);
  });
  const payments = bookings.filter((b) => b.status === "Quote" && b.paymentNote).length;
  const live = bookings.filter((b) => b.status === "Live");
  const weekLabel = new Date(`${monday}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <section>
    <div className="week-navigation"><p>Week of {weekLabel}</p><nav aria-label="Choose week"><Link className="quiet-button" href={`/manage?week=${addDays(monday, -7)}`}>Previous week</Link><Link className="quiet-button" href="/manage">This week</Link><Link className="quiet-button" href={`/manage?week=${addDays(monday, 7)}`}>Next week</Link></nav></div>
    <div className="week-layout">
      <div className="timetable-panel week-grid-panel" key={monday}>
        <div className="timetable-heading"><div><h1>Time sold this week</h1><p className="week-share">{Math.round(openHours ? soldHours / openHours * 100 : 0)}%</p></div><TimetableLegend heat /></div>
        <Timetable settings={settings} occupancy={occupancy} heat />
        <p className="timetable-note">Share of the {settings.secondsForSalePerHour / 60} minutes an hour that are for sale.</p>
      </div>
      <aside className="needs-you" aria-labelledby="needs-heading"><div className="needs-summary"><h2 id="needs-heading">Needs you</h2><p>{needsAdvert.size} {needsAdvert.size === 1 ? "advert" : "adverts"} to check, {payments} {payments === 1 ? "payment" : "payments"} to confirm</p></div>
        {needs.map((b) => <Link key={b.reference} className="needs-card" data-priority={needsAdvert.has(b.reference)} href={`/manage/bookings/${b.reference}`}>
          <div><StatusTag status={b.status} /><span>{needsAdvert.has(b.reference) ? "Advert needed" : b.paymentNote ? "Confirm payment" : "Waiting for payment"}</span></div>
          <strong>{b.business}</strong><small className="reference-link">{b.reference}</small><p>{b.plays.toLocaleString("en-GB")} plays / KES {b.priceKes.toLocaleString("en-GB")} / starts {b.request.startDate}</p>
        </Link>)}
        {!needs.length && <p className="staff-card">All caught up. No bookings need action.</p>}
        <p className="live-bookings">Live now: {live.length ? live.map((b, index) => <span key={b.reference}>{index > 0 ? ", " : ""}<Link href={`/manage/bookings/${b.reference}`}>{b.business}</Link></span>) : "No Live bookings."}</p>
      </aside>
    </div>
  </section>;
}
