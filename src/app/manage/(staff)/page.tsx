import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { addDays, formatHour, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { hourShares, weeklyTotals, weekSold, nairobiClock } from "@/lib/dashboard";
import Timetable, { TimetableLegend } from "@/components/booking/Timetable";
import StatusTag from "@/components/manage/StatusTag";
import ScreenNow from "@/components/manage/ScreenNow";
import { Ring, RevenueChart } from "@/components/workspace/Charts";
import { Card } from "@/components/ui/card";
import { number } from "@/components/booking/QuoteTotals";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireStaff();
  const params = await searchParams;
  const today = todayInNairobi();
  const date = typeof params.week === "string" && isValidDate(params.week) ? params.week : today;
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  const sunday = addDays(monday, 6);
  const store = getStore();
  const [settings, occupancy, bookings] = await Promise.all([store.getSettings(), store.occupancy(monday, sunday), store.listBookings()]);
  const paidDetails = await Promise.all(bookings.filter((booking) => booking.status === "Paid").map((booking) => store.bookingDetail(booking.reference)));
  const needsAdvert = new Set(paidDetails.filter((detail) => detail && !detail.adverts.some((advert) => advert.decision === "approved")).map((detail) => detail!.booking.reference));
  const needs = bookings.filter((booking) => needsAdvert.has(booking.reference) || booking.status === "Quote").sort((first, second) => {
    const priority = (booking: typeof first) => needsAdvert.has(booking.reference) ? 0 : booking.paymentNote ? 1 : 2;
    return priority(first) - priority(second) || first.request.startDate.localeCompare(second.request.startDate);
  });
  const live = bookings.filter((booking) => booking.status === "Live");
  const collect = bookings.filter((booking) => booking.status === "Quote");
  const weeks = weeklyTotals(bookings, monday);
  const total = weeks[weeks.length - 1];
  const hours = hourShares(bookings, today, settings);
  const now = new Date();
  const clock = nairobiClock(now);
  let schedule = null;
  let scheduleError = false;
  try { schedule = await store.schedule(today, today); } catch { scheduleError = true; }
  const weekLabel = new Date(monday + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <section>
    <div className="week-navigation"><p>Overview / week of {weekLabel}</p><nav aria-label="Choose week"><Link className="quiet-button" href={"/manage?week=" + addDays(monday, -7)}>Previous week</Link><Link className="quiet-button" href="/manage">This week</Link><Link className="quiet-button" href={"/manage?week=" + addDays(monday, 7)}>Next week</Link></nav></div>
    <div className="overview-bento">
      <ScreenNow schedule={schedule} businesses={Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]))} shares={hours} settings={settings} now={now.toISOString()} error={scheduleError} />
      <Card className="revenue-tile"><h2>Booked this week</h2><p className="big-figure rolling-number" key={total.kes}>KES {number(total.kes)}</p><p className="muted">{total.count} bookings created / cancelled excluded</p><RevenueChart weeks={weeks} /></Card>
      <Card className="needs-you"><div className="tile-heading"><h2>Needs you</h2><strong className="amber">{needs.length}</strong></div><div className="needs-list">{needs.map((booking) => <Link key={booking.reference} className="needs-card" data-priority={needsAdvert.has(booking.reference)} href={"/manage/bookings?selected=" + booking.reference}><div><StatusTag status={booking.status} /><strong>{needsAdvert.has(booking.reference) ? "Check advert" : booking.paymentNote ? "Confirm payment" : "Awaiting payment"}</strong></div><p>{booking.business} / KES {number(booking.priceKes)}</p></Link>)}{!needs.length && <p className="empty-state">All caught up. No bookings need action.</p>}</div></Card>
      <Card className="week-grid-panel"><div className="timetable-heading"><h2>Time sold this week</h2><TimetableLegend heat /></div><Timetable settings={settings} occupancy={occupancy} heat /><p className="timetable-note">Share of {settings.secondsForSalePerHour / 60} saleable minutes an hour. Paid, Approved and Live bookings.</p></Card>
      <Card className="week-ring-tile"><Ring value={weekSold(occupancy, settings)} label="week sold" /><p className="muted">Weighted by screen opening hours.</p></Card>
      <Card className="hour-tile"><div className="tile-heading"><h2>Today, hour by hour</h2><span className="muted">Sold share</span></div><div className="hour-bars" role="list" aria-label="Today's sold share by hour">{hours.map(({ hour, share }) => <div key={hour} role="listitem" aria-label={formatHour(hour) + ": " + Math.round(share * 100) + "% sold"} data-now={hour === clock.hour}><div className="hour-bar-track"><span style={{ transform: "scaleY(" + Math.min(1, share) + ")" }} /></div><small>{hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}</small></div>)}</div>{!hours.length && <p className="empty-state">The screen is closed today.</p>}</Card>
      <Card className="live-tile"><div className="tile-heading"><h2>Live</h2><span className="live-text">{live.length} bookings</span></div>{live.map((booking) => <Link key={booking.reference} href={"/manage/bookings?selected=" + booking.reference} className="live-row"><span>{booking.business}</span><strong>{number(booking.request.lengthSeconds * booking.request.howOften / settings.secondsForSalePerHour * 100)}%</strong><span className="live-track"><i style={{ transform: "scaleX(" + Math.min(1, booking.request.lengthSeconds * booking.request.howOften / settings.secondsForSalePerHour) + ")" }} /></span></Link>)}{!live.length && <p className="empty-state">No Live bookings.</p>}<p className="muted">Share per booked hour. Not measured play progress.</p><Link href="/manage/schedule" className="quiet-button">Open playlist</Link></Card>
      <Card className="collect-tile"><h2>To collect</h2><p key={collect.reduce((sum, booking) => sum + booking.priceKes, 0)} className="big-figure rolling-number">KES {number(collect.reduce((sum, booking) => sum + booking.priceKes, 0))}</p><p className="muted">{collect.length} quotes awaiting payment confirmation</p><div className="collect-links">{collect.map((booking) => <Link key={booking.reference} className="reference-link" href={"/manage/bookings?selected=" + booking.reference}>{booking.reference}</Link>)}</div></Card>
    </div>
  </section>;
}
