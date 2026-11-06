import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { addDays, formatHour, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { hourShares, weeklyTotals, weekSold, nairobiClock } from "@/lib/dashboard";
import Timetable, { TimetableLegend } from "@/components/booking/Timetable";
import { ArrowRight, Play } from "@phosphor-icons/react/dist/ssr";
import ScreenNow from "@/components/manage/ScreenNow";
import { RevenueChart } from "@/components/workspace/Charts";
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
  const shortDate = (iso: string, weekday = false) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: weekday ? "short" : undefined, day: "numeric", month: "short", timeZone: "UTC" });
  const toCollect = collect.reduce((sum, booking) => sum + booking.priceKes, 0);
  const paidNotLive = bookings.filter((booking) => booking.status === "Paid" || booking.status === "Approved");
  const sold = weekSold(occupancy, settings);
  const thisWeek = monday === addDays(today, -((weekdayOf(today) + 6) % 7));
  const soon = bookings.filter((booking) => ["Quote", "Paid", "Approved"].includes(booking.status) && booking.request.startDate >= today && booking.request.startDate <= addDays(today, 13))
    .sort((first, second) => first.request.startDate.localeCompare(second.request.startDate)).slice(0, 5);
  return <section>
    <div className="overview-bento">
      <ScreenNow schedule={schedule} businesses={Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]))} shares={hours} settings={settings} now={now.toISOString()} error={scheduleError} />
      <Card className="revenue-tile"><h2>Booked this week</h2><p className="big-figure rolling-number" key={total.kes}>KES {number(total.kes)}</p><p className="muted">{total.count} bookings created / cancelled excluded</p><RevenueChart weeks={weeks} /></Card>
      <Card className="week-grid-panel"><div className="timetable-heading"><h2>Time sold this week</h2><TimetableLegend heat /></div><Timetable settings={settings} occupancy={occupancy} heat /><p className="timetable-note">Share of {settings.secondsForSalePerHour / 60} saleable minutes an hour. Paid, Approved and Live bookings.</p></Card>
      <Card className="hour-tile"><div className="tile-heading"><h2>Today, hour by hour</h2><span className="muted">Sold share</span></div><div className="hour-bars" role="list" aria-label="Today's sold share by hour">{hours.map(({ hour, share }) => <div key={hour} role="listitem" aria-label={formatHour(hour) + ": " + Math.round(share * 100) + "% sold"} data-now={hour === clock.hour}><div className="hour-bar-track"><span style={{ transform: "scaleY(" + Math.min(1, share) + ")" }} /></div><small>{hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}</small></div>)}</div>{!hours.length && <p className="empty-state">The screen is closed today.</p>}</Card>
      <Card className="live-tile">
        <div className="tile-heading">
          <div className="live-heading-title"><h2>Live</h2><span className="live-text">{live.length} {live.length === 1 ? "booking" : "bookings"}</span></div>
          <Link href="/manage/schedule" className="quiet-button live-playlist">Open playlist <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="live-list">{live.map((booking) => ({ booking, share: booking.request.lengthSeconds * booking.request.howOften / settings.secondsForSalePerHour })).sort((a, b) => b.share - a.share).map(({ booking, share }) => <Link key={booking.reference} href={"/manage/bookings?selected=" + booking.reference} className="needs-row live-row">
          <span className="needs-icon live-icon" aria-hidden="true"><Play size={14} weight="fill" /></span>
          <span><b>{booking.business}</b><small>{Math.round(share * 100)}% share per booked hour</small></span>
        </Link>)}{!live.length && <p className="empty-state">No Live bookings.</p>}</div>
        <p className="live-note">Share per booked hour. Not measured play progress.</p>
      </Card>
      <div className="overview-side">
        <Card className="money-tile">
          <div className="tile-heading"><h2>Money</h2><span className="soft-pill">{thisWeek ? "This week" : "Week of " + shortDate(monday)}</span></div>
          <div className="money-figures">
            <Link href="/manage/bookings?status=Quote"><small>To collect</small><strong key={toCollect} className="rolling-number">{number(toCollect)}</strong><small>{collect.length} {collect.length === 1 ? "quote" : "quotes"}</small></Link>
            <Link href="/manage/bookings"><small>Paid, not live</small><strong className="rolling-number">{number(paidNotLive.reduce((sum, booking) => sum + booking.priceKes, 0))}</strong><small>{paidNotLive.length} {paidNotLive.length === 1 ? "booking" : "bookings"}</small></Link>
          </div>
          <div className="sold-bar"><div><span>Time sold this week</span><b>{Math.round(sold * 100)}%</b></div><span className="sold-track" role="img" aria-label={Math.round(sold * 100) + "% of this week's time sold, weighted by screen opening hours"}><i style={{ transform: "scaleX(" + Math.min(1, sold) + ")" }} /></span></div>
        </Card>
        <Card className="needs-you">
          <div className="tile-heading"><h2>Needs you</h2><strong className="amber">{needs.length}</strong></div>
          <div className="needs-list">{needs.map((booking) => {
            const advert = needsAdvert.has(booking.reference);
            return <Link key={booking.reference} className="needs-row" data-priority={advert} href={"/manage/bookings?selected=" + booking.reference}>
              <span className="needs-icon" aria-hidden="true">{advert ? <Play size={14} weight="fill" /> : "KES"}</span>
              <span><b>{advert ? "Check the advert" : booking.paymentNote ? "Confirm payment" : "Awaiting payment"}</b><small>{booking.business}{advert ? "" : ", KES " + number(booking.priceKes)}, starts {shortDate(booking.request.startDate)}</small></span>
            </Link>;
          })}{!needs.length && <p className="empty-state">All caught up. No bookings need action.</p>}</div>
          <Link href="/manage/bookings" className="view-all">View all bookings <ArrowRight size={14} aria-hidden="true" /></Link>
        </Card>
        <Card className="soon-tile">
          <div className="tile-heading"><h2>Starting soon</h2><span className="muted">next 14 days</span></div>
          {soon.map((booking) => <Link key={booking.reference} href={"/manage/bookings?selected=" + booking.reference} className="soon-row" data-paid={booking.status !== "Quote"}><span>{shortDate(booking.request.startDate, true)}</span><span>{booking.business}, {booking.status}</span></Link>)}
          {!soon.length && <p className="empty-state">Nothing starts in the next 14 days.</p>}
        </Card>
      </div>
    </div>
  </section>;
}
