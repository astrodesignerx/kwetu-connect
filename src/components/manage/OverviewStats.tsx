import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { number } from "@/components/booking/QuoteTotals";
import { shortDate } from "@/lib/format/dates";
import { AvatarStack } from "./V2Visuals";

type Week = { from: string; kes: number; count: number };

function Stat({ label, value, note, tag, href, linkLabel, children }: { label: string; value: ReactNode; note: string; tag?: string; href?: string; linkLabel?: string; children?: ReactNode }) {
  return <section className="mg-stat">
    <div className="mg-stat-label"><span>{label}</span>{tag && <em className="mg-tag">{tag}</em>}{href && <ArrowUpRight className="mg-stat-arrow" size={14} aria-hidden="true" />}</div>
    <div className="mg-stat-number">{value}</div>
    <div className="mg-stat-foot"><span>{note}</span>{children}</div>
    {href && <Link href={href} className="mg-stat-link" aria-label={linkLabel ?? label} />}
  </section>;
}

/** The four Overview figures: screen time sold, booked this week, to collect and live now. */
export default function OverviewStats({ sold, weeks, toCollect, quotes, live, nextStart }: { sold: number; weeks: Week[]; toCollect: number; quotes: number; live: { name: string; colour: string }[]; nextStart: string | null }) {
  const total = weeks[weeks.length - 1];
  const max = Math.max(1, ...weeks.map((week) => week.kes));
  const percent = Math.round(sold * 100);
  return <div className="mg-stats">
    <Stat label="Screen time sold" value={<>{percent}<small>% this week</small></>} note="Of saleable screen time this week" href="/manage/schedule" linkLabel={`Screen time sold, ${percent}% of saleable screen time this week. Open screen schedule`}>
      <span className="mg-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, sold))})` }} /></span>
    </Stat>
    <Stat label="Booked this week" value={<><small>KES</small>{number(total.kes)}</>} note="Created this week, cancelled excluded" tag={`${total.count} ${total.count === 1 ? "booking" : "bookings"}`}>
      <span className="mg-trend" role="img" aria-label={"Bookings created in the last seven weeks, cancelled excluded: " + weeks.map((week) => `week of ${shortDate(week.from)}, KES ${number(week.kes)}`).join("; ")}>
        {weeks.map((week) => <i key={week.from} style={{ "--height": Math.max(6, Math.round(week.kes / max * 100)) + "%" } as CSSProperties} />)}
      </span>
    </Stat>
    <Stat label="To collect" value={<><small>KES</small>{number(toCollect)}</>} note="Unpaid quotes" tag={`${quotes} ${quotes === 1 ? "quote" : "quotes"}`} href="/manage/bookings?status=Quote" linkLabel="Open unpaid quotes" />
    <Stat label="Live now" value={<>{live.length}<small>bookings</small></>} note={nextStart ? "Next start " + nextStart : "Scheduled, not measured playback"} href="/manage/schedule" linkLabel="Open playlist">
      <AvatarStack people={live.slice(0, 4)} extra={live.length - 4} />
    </Stat>
  </div>;
}
