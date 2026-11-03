import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { StoreError, todayInNairobi } from "@/lib/store/validation";
import { addDays, formatHour } from "@/lib/booking/hours";
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff();
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : todayInNairobi();
  const to = typeof params.to === "string" ? params.to : addDays(todayInNairobi(), 6);
  let schedule;
  let error = "";
  try { schedule = await getStore().schedule(from, to); } catch (e) { if (!(e instanceof StoreError)) throw e; error = e.message; }
  const query = new URLSearchParams({ from, to });
  return <section className="space-y-6"><h1 className="text-2xl font-bold">Screen schedule</h1><p>Approved and Live bookings, with approved adverts only.</p>
    <form method="get" className="staff-form staff-card grid items-end gap-3 sm:grid-cols-3"><label>From<input name="from" type="date" required defaultValue={from} /></label><label>To<input name="to" type="date" required defaultValue={to} /></label><button className="staff-button">Build schedule</button></form>
    {error && <p role="alert">{error}</p>}
    {schedule && <div key={query.toString()} className="animate-quote-in space-y-6 motion-reduce:animate-none">
      <div className="flex flex-wrap gap-3"><a className="staff-button" href={`/manage/schedule/download?${query}&file=playlists.csv`}>Download playlists.csv</a><a className="staff-button" href={`/manage/schedule/download?${query}&file=schedule.csv`}>Download schedule.csv</a></div>
      <section className="staff-card"><h2>Schedule rows ({schedule.rows.length})</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Playlist", "From", "To", "Screen hours"].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{schedule.rows.map((row, index) => <tr key={index} className="border-t border-gray-200"><td className="px-3 py-2">{row.playlist}</td><td className="whitespace-nowrap px-3 py-2">{row.startDate}</td><td className="whitespace-nowrap px-3 py-2">{row.endDate}</td><td className="whitespace-nowrap px-3 py-2">{formatHour(row.startHour)} to {formatHour(row.endHour)}</td></tr>)}</tbody></table></div></section>
      <section className="staff-card space-y-3"><h2>Playlists ({schedule.playlists.length})</h2>{schedule.playlists.map((playlist) => <details key={playlist.name} className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer">{playlist.name} ({playlist.items.length} entries)</summary><ol className="mt-4 space-y-2 text-sm">{playlist.items.map((item, index) => <li className="break-all" key={index}>{item.start}s / {item.kind === "kca" ? "KCA time" : item.advert} / {item.seconds} seconds</li>)}</ol></details>)}</section>
    </div>}
  </section>;
}
