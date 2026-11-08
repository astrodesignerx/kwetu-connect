import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { StoreError, todayInNairobi } from "@/lib/store/validation";
import { addDays, formatHour, weekdayOf } from "@/lib/booking/hours";
import { scheduleCells } from "@/lib/manager-schedule";
import ScheduleTimeline from "@/components/manage/ScheduleTimeline";
import Link from "next/link";
import { CaretLeft, CaretRight, FilmStrip } from "@phosphor-icons/react/dist/ssr";
import ScheduleHours from "@/components/manage/ScheduleHours";
import { shortDate } from "@/lib/format/dates";
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff();
  const params = await searchParams;
  const monday = addDays(todayInNairobi(), -((weekdayOf(todayInNairobi()) + 6) % 7));
  const from = typeof params.from === "string" ? params.from : monday;
  const to = typeof params.to === "string" ? params.to : addDays(monday, 6);
  const store = getStore();
  const [bookings, settings] = await Promise.all([store.listBookings(), store.getSettings()]);
  let schedule;
  let error = "";
  try { schedule = await store.schedule(from, to); } catch (e) { if (!(e instanceof StoreError)) throw e; error = e.message; }
  const query = new URLSearchParams({ from, to });
  return <section className="pipeline-page schedule-page"><div className="pipeline-toolbar">
      {schedule && <nav className="week-picker" aria-label="Schedule weeks"><Link href={"/manage/schedule?from=" + addDays(from, -7) + "&to=" + addDays(from, -1)} aria-label="Previous week"><CaretLeft size={14} aria-hidden="true" /></Link><Link href="/manage/schedule">This week</Link><Link href={"/manage/schedule?from=" + addDays(from, 7) + "&to=" + addDays(from, 13)} aria-label="Next week"><CaretRight size={14} aria-hidden="true" /></Link></nav>}
      <details className="v2-date-range"><summary>Custom date range</summary><form method="get" className="staff-form staff-card grid items-end gap-3 sm:grid-cols-3"><label>From<input name="from" type="date" required defaultValue={from} /></label><label>To<input name="to" type="date" required defaultValue={to} /></label><button className="staff-button">Build schedule</button></form></details>
      <div className="pipeline-actions"><Link href="/manage/adverts" className="quiet-button"><FilmStrip size={14} aria-hidden="true" />Review adverts</Link></div>
    </div>
    {error && <p role="alert">{error}</p>}
    {schedule && <div key={query.toString()} className="animate-quote-in space-y-6 motion-reduce:animate-none">
      <ScheduleHours schedule={schedule} businesses={Object.fromEntries(bookings.map((booking) => [booking.reference, booking.business]))} from={from} to={to} settings={settings} now={new Date().toISOString()} />
      <details className="staff-card"><summary>Expanded timelines and block bookings</summary><ScheduleTimeline cells={scheduleCells(schedule, bookings, settings, from, to)} from={from} to={to} settings={settings} now={new Date().toISOString()} /></details>
      <div className="flex flex-wrap gap-3"><a className="staff-button" href={`/manage/schedule/download?${query}&file=playlists.csv`}>Download playlists.csv</a><a className="staff-button" href={`/manage/schedule/download?${query}&file=schedule.csv`}>Download schedule.csv</a></div>
      <details className="staff-card"><summary>Schedule rows ({schedule.rows.length})</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Playlist", "From", "To", "Screen hours"].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{schedule.rows.map((row, index) => <tr key={index} className="border-t border-gray-200"><td className="px-3 py-2">{row.playlist}</td><td className="whitespace-nowrap px-3 py-2">{shortDate(row.startDate)}</td><td className="whitespace-nowrap px-3 py-2">{shortDate(row.endDate)}</td><td className="whitespace-nowrap px-3 py-2">{formatHour(row.startHour)} to {formatHour(row.endHour)}</td></tr>)}</tbody></table></div></details>
      <section className="staff-card space-y-3"><h2>Playlists ({schedule.playlists.length})</h2>{schedule.playlists.map((playlist) => <details key={playlist.name} className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer">{playlist.name} ({playlist.items.length} entries)</summary><ol className="mt-4 space-y-2 text-sm">{playlist.items.map((item, index) => <li className="break-all" key={index}>{item.start}s / {item.kind === "kca" ? "KCA time" : item.advert} / {item.seconds} seconds</li>)}</ol></details>)}</section>
    </div>}
  </section>;
}
