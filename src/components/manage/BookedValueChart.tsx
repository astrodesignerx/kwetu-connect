"use client";

import { useState, type CSSProperties } from "react";
import { number } from "@/components/booking/QuoteTotals";
import { shortDate } from "@/lib/format/dates";

/** Weekly created-booking totals, using the same figures as the previous chart. */
export default function BookedValueChart({ weeks }: { weeks: { from: string; kes: number; count: number }[] }) {
  const [selected, setSelected] = useState(weeks.length - 1);
  const max = Math.max(1, ...weeks.map((week) => week.kes));
  const week = weeks[selected];
  return <div className="mg-value-chart">
    <div className="mg-week-bars" role="group" aria-label="Booked value by week created, cancelled excluded">
      {weeks.map((item, index) => <button type="button" key={item.from} aria-pressed={selected === index} onClick={() => setSelected(index)} aria-label={`Week of ${shortDate(item.from)}, KES ${number(item.kes)}, ${item.count} bookings`}>
        <span className="mg-week-track"><i style={{ "--share": item.kes / max } as CSSProperties} /></span><small>{shortDate(item.from)}</small>
      </button>)}
    </div>
    <p className="mg-week-readout" aria-live="polite">{week ? `Week of ${shortDate(week.from)} / KES ${number(week.kes)} / ${week.count} booking${week.count === 1 ? "" : "s"}` : "No bookings created in these weeks."}</p>
  </div>;
}
