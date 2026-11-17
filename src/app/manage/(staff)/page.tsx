import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { addDays, isValidDate, weekdayOf } from "@/lib/booking/hours";
import { blockShares, currentPlaylist, hourShares, onAirStatus, weeklyTotals, weekSold, nairobiClock } from "@/lib/dashboard";
import type { PlaylistItem, Schedule } from "@/lib/booking/playlist";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import OverviewBanner from "@/components/manage/OverviewBanner";
import NowNext, { type NowNextRow } from "@/components/manage/NowNext";
import OverviewWeek from "@/components/manage/OverviewWeek";
import OverviewStats from "@/components/manage/OverviewStats";
import NeedsYou, { type Task } from "@/components/manage/NeedsYou";
import ClockPill from "@/components/manage/ClockPill";
import { BlockRows, CapsuleBars } from "@/components/manage/V2Visuals";
import { number } from "@/components/booking/QuoteTotals";
import { dayDate, shortDate } from "@/lib/format/dates";
import { avatarColour } from "@/lib/booking/pipeline";

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
  const detailOf = new Map(paidDetails.flatMap((detail) => detail ? [[detail.booking.reference, detail] as const] : []));
  const byStart = (first: { request: { startDate: string } }, second: { request: { startDate: string } }) => first.request.startDate.localeCompare(second.request.startDate);
  // Paid bookings with no approved advert: a waiting advert needs review, otherwise (none, or only refused) the advert is missing.
  const unapproved = bookings.filter((booking) => booking.status === "Paid" && detailOf.get(booking.reference) && !detailOf.get(booking.reference)!.adverts.some((advert) => advert.decision === "approved")).sort(byStart);
  const waitingAdvert = (reference: string) => detailOf.get(reference)!.adverts.find((advert) => advert.decision === "waiting");
  const quotes = bookings.filter((booking) => booking.status === "Quote").sort(byStart);
  const unpaidQuotes = quotes.filter((booking) => !booking.paymentNote);
  const contact = (reference: string) => "/manage/bookings?selected=" + reference + "&tab=Contact";
  const tasks: Task[] = [
    ...unapproved.filter((booking) => waitingAdvert(booking.reference)).map((booking): Task => { const advert = waitingAdvert(booking.reference)!; const extension = advert.fileName.includes(".") ? advert.fileName.split(".").pop()!.toUpperCase() : "file"; return { key: "review" + booking.reference, kind: "review", title: "Review the advert", detail: `${booking.business}, ${advert.seconds}s ${extension}`, action: "Review", href: "/manage/adverts?q=" + encodeURIComponent(booking.reference), start: booking.request.startDate }; }),
    ...unapproved.filter((booking) => !waitingAdvert(booking.reference)).map((booking): Task => ({ key: "chase" + booking.reference, kind: "chase", title: "Chase the missing advert", detail: `${booking.business}, paid KES ${number(booking.priceKes)}`, action: "Remind", href: contact(booking.reference), start: booking.request.startDate })),
    ...quotes.filter((booking) => booking.paymentNote).map((booking): Task => ({ key: "confirm" + booking.reference, kind: "confirm", title: "Confirm payment", detail: `${booking.business}, KES ${number(booking.priceKes)}`, action: "Confirm", href: "/manage/bookings?selected=" + booking.reference, start: booking.request.startDate })),
    ...(unpaidQuotes.length ? [{ key: "nudge", kind: "nudge", title: `${unpaidQuotes.length} ${unpaidQuotes.length === 1 ? "quote" : "quotes"} awaiting payment`, detail: unpaidQuotes.length > 2 ? `${unpaidQuotes[0].business}, ${unpaidQuotes[1].business} and ${unpaidQuotes.length - 2} more` : unpaidQuotes.map((booking) => booking.business).join(" and "), action: "Nudge", href: unpaidQuotes.length === 1 ? contact(unpaidQuotes[0].reference) : "/manage/bookings?status=Quote", start: unpaidQuotes[0].request.startDate } satisfies Task] : []),
  ];
  const live = bookings.filter((booking) => booking.status === "Live");
  const nextStart = bookings.filter((booking) => booking.status === "Approved" && booking.request.startDate > today).sort(byStart)[0];
  const collect = bookings.filter((booking) => booking.status === "Quote");
  const weeks = weeklyTotals(bookings, monday);
  const hours = hourShares(bookings, today, settings);
  const now = new Date();
  const clock = nairobiClock(now);
  let schedule = null;
  let scheduleError = false;
  try { schedule = await store.schedule(today, today); } catch { scheduleError = true; }
  const businesses = Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]));
  const plays = (items: PlaylistItem[], item: PlaylistItem) => item.kind === "advert" ? items.filter((other) => other.kind === "advert" && other.bookingId === item.bookingId).length : null;
  const rowOf = (items: PlaylistItem[], item: PlaylistItem, tag: NowNextRow["tag"]): NowNextRow => ({ id: item.kind === "advert" ? item.bookingId : "kca", name: item.kind === "advert" ? businesses[item.bookingId] ?? item.bookingId : "KCA time", tag, length: item.seconds, plays: plays(items, item) });
  const hourItems = (from: Schedule, date: string, hour: number) => { const row = from.rows.find((item) => item.startDate <= date && item.endDate >= date && hour >= item.startHour && hour < item.endHour); return from.playlists.find((playlist) => playlist.name === row?.playlist)?.items ?? []; };
  let nowNext: NowNextRow[] = [];
  if (schedule) {
    if (onAirStatus(settings, now).onAir) {
      const items = hourItems(schedule, today, clock.hour);
      const { current, next } = currentPlaylist(schedule, today, clock.hour, clock.second);
      nowNext = [current && rowOf(items, current, "playing"), next && rowOf(items, next, "next")].filter((row): row is NowNextRow => !!row);
    } else {
      // Screen closed: show the first two adverts of the next open hour.
      for (let offset = 0; offset <= 7 && !nowNext.length; offset++) {
        const day = addDays(today, offset);
        const screen = settings.screenHours[weekdayOf(day)];
        if (!screen || screen.open >= screen.close || (offset === 0 && clock.hour >= screen.open)) continue;
        let source: Schedule | null = schedule;
        if (offset > 0) { try { source = await store.schedule(day, day); } catch { source = null; } }
        const items = source ? hourItems(source, day, screen.open) : [];
        nowNext = items.filter((item) => item.kind === "advert").slice(0, 2).map((item, index) => rowOf(items, item, index ? "next" : "first"));
        break;
      }
    }
  }
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
  const pad = (value: number) => String(value).padStart(2, "0");
  const thisMonday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const onAir = onAirStatus(settings, now).onAir;
  return <section className="mg-overview">
    <div className="mg-left">
      <div className="mg-intro"><h1 className="mg-heading">Screen overview</h1><div className="mg-intro-controls"><OverviewWeek monday={monday} thisMonday={thisMonday} /><Link href="/manage/schedule" className="mg-primary">Open schedule<ArrowUpRight size={12} aria-hidden="true" /></Link></div></div>
      <section className="mg-panel mg-main-panel">
        <div className="mg-section-heading"><div><span className="mg-eyebrow">Your Eldoret screen</span><h2>Tonight on Kisumu Ndogo Rd</h2></div><ClockPill now={now.toISOString()} /></div>
        <div className="mg-stage"><OverviewBanner sold={tonight} /><NowNext rows={nowNext} time={pad(clock.hour) + ":" + pad(Math.floor(clock.second / 60))} empty={scheduleError ? "The playlist could not be loaded." : undefined} /></div>
      </section>
      <div className="mg-lower">
        <section className="mg-panel mg-hours"><span className="mg-eyebrow">Planned screen time</span><h2>Today by hour</h2><CapsuleBars hours={hours} currentHour={clock.hour} label="Planned screen time sold today, by hour" readout /></section>
        <section className="mg-panel mg-heat"><span className="mg-eyebrow">Week of {shortDate(monday)}, planned</span><h2>Sold by hour</h2><BlockRows blocks={blockShares(rows, settings)} today={today} /></section>
      </div>
    </div>
    <aside className="mg-right" aria-label="This week at a glance">
      <OverviewStats sold={sold} weeks={weeks} toCollect={toCollect} quotes={collect.length} live={live.map((booking) => ({ name: booking.business, colour: avatarColour(booking.business) }))} nextStart={nextStart ? dayDate(nextStart.request.startDate) : null} />
      <NeedsYou tasks={tasks} soon={soon.map((booking) => ({ reference: booking.reference, business: booking.business, status: booking.status, startDate: booking.request.startDate }))} today={today} />
      <div className="mg-panel mg-location"><span><b>Kisumu Ndogo Rd</b><small>Eldoret / Scheduled, not measured playback</small></span><em className="mg-tag" data-tone={onAir ? "green" : undefined}>{onAir ? "On air" : "Off air"}</em></div>
    </aside>
  </section>;
}
