import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { addDays, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { hourShares, weeklyTotals, weekSold, nairobiClock } from "@/lib/dashboard";
import { ArrowRight, Fire, Play, Trophy } from "@phosphor-icons/react/dist/ssr";
import OverviewBanner from "@/components/manage/OverviewBanner";
import { CapsuleBars, DarkIsland, FolderCard, HourTiles } from "@/components/manage/V2Visuals";
import { RevenueChart } from "@/components/workspace/Charts";
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
  const shortDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const toCollect = collect.reduce((sum, booking) => sum + booking.priceKes, 0);
  const sold = weekSold(occupancy, settings);
  const soon = bookings.filter((booking) => ["Quote", "Paid", "Approved"].includes(booking.status) && booking.request.startDate >= today && booking.request.startDate <= addDays(today, 13)).sort((first, second) => first.request.startDate.localeCompare(second.request.startDate)).slice(0, 5);
  const firstHour = Math.min(...Object.values(settings.screenHours).filter(Boolean).map((screen) => screen!.open));
  const lastHour = Math.max(...Object.values(settings.screenHours).filter(Boolean).map((screen) => screen!.close));
  const rows = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const shares = hourShares(bookings, date, settings);
    return { date, label: new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), hours: Array.from({ length: Number.isFinite(lastHour - firstHour) ? lastHour - firstHour : 0 }, (_, index) => {
      const hour = firstHour + index;
      return { hour, share: shares.find((item) => item.hour === hour)?.share ?? 0, closed: !shares.some((item) => item.hour === hour) };
    }) };
  });
  const eveningShare = (items: typeof rows[number]["hours"]) => { const open = items.filter((hour) => hour.hour >= 18 && !hour.closed); return open.length ? open.reduce((sum, hour) => sum + hour.share, 0) / open.length : 0; };
  const tonight = eveningShare(hours.map((hour) => ({ ...hour, closed: false })));
  const evenings = rows.filter((row) => eveningShare(row.hours) >= .8).length;
  return <section className="v2-overview">
    <div className="v2-overview-top"><OverviewBanner sold={tonight} needs={needs.length} live={live.length} schedule={schedule} businesses={Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]))} settings={settings} now={now.toISOString()} error={scheduleError} /><DarkIsland className="v2-today-card"><div className="v2-card-heading"><h2>Today by hour<small>{shortDate(today)}, planned</small></h2><span className="soft-pill">Now {String(clock.hour).padStart(2, "0")}:{String(Math.floor(clock.second / 60)).padStart(2, "0")}</span></div><CapsuleBars hours={hours} currentHour={clock.hour} /><Link href="/manage/schedule" className="v2-inline-link">Open the planned playlist<ArrowRight size={13} aria-hidden="true" /></Link></DarkIsland></div>
    <div className="v2-overview-folders">
      <FolderCard label="Screen time sold" value={<>{Math.round(sold * 100)}<small>% this week</small></>} note="Of saleable screen time" photo><Link href="/manage/schedule" className="v2-folder-link" aria-label="Open screen schedule" /></FolderCard>
      <FolderCard label="Booked this week" value={<><small>KES</small>{number(total.kes)}</>} note={`${total.count} created bookings, cancelled excluded`}><div className="v2-folder-chart"><RevenueChart weeks={weeks} /></div></FolderCard>
      <FolderCard label="To collect" value={<><small>KES</small>{number(toCollect)}</>} note={`${collect.length} unpaid quotes`} colour="violet"><div className="v2-quote-hatch" /><Link href="/manage/bookings?status=Quote" className="v2-folder-link" aria-label="Open unpaid quotes" /></FolderCard>
      <FolderCard label="Live now" value={<>{live.length}<small>bookings</small></>} note="Scheduled, not measured playback" colour="green"><Link href="/manage/schedule" className="v2-folder-playlist">Open playlist<ArrowRight size={12} aria-hidden="true" /></Link></FolderCard>
    </div>
    <div className="v2-overview-bottom"><section className="v2-card v2-sold-card"><div className="v2-card-heading"><h2>Sold by hour</h2><small>Week of {shortDate(monday)}, planned</small></div><HourTiles rows={rows} today={today} /></section>
      <div className="v2-task-stack" id="needs-you"><DarkIsland><div className="v2-card-heading"><h2>Needs you <span className="v2-count">{needs.length}</span></h2><Link href="/manage/bookings">See all<ArrowRight size={12} aria-hidden="true" /></Link></div><div className="v2-needs-list">{needs.map((booking) => { const advert = needsAdvert.has(booking.reference); return <Link key={booking.reference} className="v2-task" data-task={advert ? "advert" : booking.paymentNote ? "payment" : "quote"} href={"/manage/bookings?selected=" + booking.reference}><span className="v2-task-icon" aria-hidden="true">{advert ? <Play size={15} weight="fill" /> : "KES"}</span><span><b>{advert ? "Check the advert" : booking.paymentNote ? "Confirm payment" : "Awaiting payment"}</b><small>{booking.business}</small><small>Starts {shortDate(booking.request.startDate)} / KES {number(booking.priceKes)}</small></span><span className="v2-task-action">{advert ? "Review" : booking.paymentNote ? "Check" : "Open"}</span></Link>; })}{!needs.length && <p className="empty-state">All caught up. No bookings need action.</p>}</div><details className="v2-starting-soon"><summary>Starting soon ({soon.length})</summary>{soon.map((booking) => <Link key={booking.reference} href={"/manage/bookings?selected=" + booking.reference}><span>{booking.business}</span><small>{shortDate(booking.request.startDate)} / {booking.status}</small></Link>)}{!soon.length && <p>No bookings start in the next 14 days.</p>}</details></DarkIsland></div>
    </div>
    <section className="v2-card v2-evenings"><span className="v2-trophy"><Trophy size={19} aria-hidden="true" /></span><div><h2>Evenings above 80% sold</h2><p>{evenings} of 7 this week, planned</p></div><div className="v2-evening-days">{rows.map((row) => <div key={row.date}><span data-lit={eveningShare(row.hours) >= .8}><Fire size={15} weight={eveningShare(row.hours) >= .8 ? "fill" : "regular"} aria-hidden="true" /></span><small>{row.label}</small></div>)}</div><Link href={"/manage?week=" + addDays(monday, 7)} className="quiet-button">Plan next week<ArrowRight size={14} aria-hidden="true" /></Link></section>
  </section>;
}
