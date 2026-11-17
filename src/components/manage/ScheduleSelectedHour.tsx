import Link from "next/link";
import { formatHour } from "@/lib/booking/hours";
import { dayDate } from "@/lib/format/dates";

const COLOURS = [
  "var(--mg-accent)",
  "var(--mg-green)",
  "var(--mg-highlight)",
  "var(--mg-muted)",
  "var(--mg-rose)",
  "color-mix(in srgb, var(--mg-accent) 55%, var(--mg-text))",
];
export default function ScheduleSelectedHour({
  date,
  hour,
  items,
  secondsForSale,
  isOpen,
  playlist,
}: {
  date: string;
  hour: number;
  items: { reference: string; business: string; seconds: number; share: number }[];
  secondsForSale: number;
  isOpen: boolean;
  playlist?: { name: string; entries: number } | null;
}) {
  const sold = items.reduce((total, entry) => total + entry.share, 0);
  const segments = items.map((item, index) => {
    const start = Math.min(100, items.slice(0, index).reduce((total, entry) => total + entry.share * 100, 0));
    return { ...item, start, size: Math.min(item.share * 100, Math.max(0, 100 - start)), colour: COLOURS[index % COLOURS.length] };
  });
  const saleableMinutes = Number((secondsForSale / 60).toFixed(1));
  const playlistLabel = playlist === undefined
    ? null
    : isOpen && playlist
      ? `${playlist.name}, ${playlist.entries} ${playlist.entries === 1 ? "entry" : "entries"}`
      : "No playlist";
  return <section className="v2-card v2-hour-donut" aria-live="polite">
    <div className="v2-card-heading">
      <div>
        <span className="mg-eyebrow">{dayDate(date)}, planned</span>
        <h2>{formatHour(hour)} to {formatHour(hour + 1)}</h2>
      </div>
      {playlistLabel && <span className="mg-pill">{playlistLabel}</span>}
    </div>
    <div className="v2-donut-content" key={date + hour}>
      <div className="v2-donut"><svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="48" pathLength="100" fill="none" stroke="var(--mg-track)" strokeWidth="12" />
        {segments.map((item) => <circle key={item.reference} cx="60" cy="60" r="48" pathLength="100" fill="none" stroke={item.colour} strokeWidth="12" strokeDasharray={item.size + " " + (100 - item.size)} strokeDashoffset={-item.start} />)}
      </svg><div><b>{isOpen ? Math.round(sold * 100) + "%" : "Closed"}</b><small>{isOpen ? (sold * secondsForSale / 60).toFixed(1) + " of " + saleableMinutes + " min" : "Screen hours"}</small></div></div>
      <div className="v2-donut-legend">
        {segments.map((item) => <Link key={item.reference} href={"/manage/bookings/" + item.reference}><i style={{ background: item.colour }} /><span>{item.business}</span><small>{(item.seconds / 60).toFixed(1)} min</small></Link>)}
        {isOpen ? <div><i /><span>Unsold saleable time</span><small>{(Math.max(0, 1 - sold) * secondsForSale / 60).toFixed(1)} min</small></div> : <p>No plays are planned in this hour.</p>}
      </div>
    </div>
    <p className="pipeline-help">Share of saleable time, Nairobi time. Reserved KCA time is separate.</p>
  </section>;
}
