import { Fragment } from "react";
import type { BookingSettings } from "@/lib/booking/settings";
import type { Occupancy } from "@/lib/booking/occupancy";
import { BLOCK_ORDER, DAY_ORDER, type Selection, type SelectionAction } from "@/lib/booking/selection";
import { cellKey, requestCells } from "@/lib/booking/hours";

/** A tick that draws itself in. */
function Tick() {
  return <svg className="cell-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Props = { settings: BookingSettings; occupancy: Occupancy; selection?: Selection;
  onSelect?: (action: SelectionAction) => void; heat?: boolean; pending?: boolean };

export function TimetableLegend({ heat = false }: { heat?: boolean }) {
  return <div className="timetable-legend" aria-label={heat ? "Time sold legend" : "Availability legend"}>
    {(heat ? [["open", "Under 40%"], ["mid", "40 to 79%"], ["selected", "80% or more"]]
      : [["selected", "Yours"], ["busy", "Busy"], ["open", "Open"]]).map(([tone, label]) =>
      <span key={tone}><i className={`legend-swatch is-${tone}`} aria-hidden="true" />{label}</span>)}
  </div>;
}

export default function Timetable({ settings, occupancy, selection, onSelect, heat = false, pending = false }: Props) {
  const chosen = new Set(selection ? requestCells(selection) : []);
  const dayFull = (day: number) => BLOCK_ORDER.every((block) => !occupancy[day][block].open || chosen.has(cellKey(day, block)));
  const blockFull = (block: (typeof BLOCK_ORDER)[number]) => DAY_ORDER.every((day) => !occupancy[day][block].open || chosen.has(cellKey(day, block)));
  return <div className="timetable" role="group" aria-busy={pending} aria-label={heat ? "Share of time sold by day and time" : "Days and times"}>
    <span aria-hidden="true" />
    {DAY_ORDER.map((day) => onSelect ? <button type="button" className="day-heading" key={day}
      aria-label={`All of ${DAYS[day]}`} aria-pressed={dayFull(day)} data-some={selection?.days.includes(day) ?? false}
      onClick={() => onSelect({ kind: "day", day })}>{DAYS[day].slice(0, 3)}</button>
      : <span className="day-heading" key={day}>{DAYS[day].slice(0, 3)}</span>)}
    {BLOCK_ORDER.map((block) => {
      const time = settings.timeBlocks[block];
      const label = <><strong>{time.label}</strong><small>{String(time.startHour).padStart(2, "0")} to {String(time.endHour).padStart(2, "0")}</small></>;
      return <Fragment key={block}>
        {onSelect ? <button type="button" className="block-heading" aria-label={`Every ${time.label.toLowerCase()}`}
          aria-pressed={blockFull(block)} data-some={selection?.blocks.includes(block) ?? false} onClick={() => onSelect({ kind: "block", block })}>{label}</button>
          : <span className="block-heading">{label}</span>}
        {DAY_ORDER.map((day) => {
          const cell = occupancy[day][block];
          const selected = chosen.has(cellKey(day, block));
          if (!cell.open) return <span key={day} role="img" className="time-cell is-closed" aria-label={`${DAYS[day]} ${time.label.toLowerCase()}, closed`}><span aria-hidden="true">Closed</span></span>;
          const tone = selected ? "selected" : pending ? "pending" : heat ? cell.soldShare >= 0.8 ? "selected" : cell.soldShare >= 0.4 ? "mid" : "open" : cell.soldShare >= 0.6 ? "busy" : "open";
          const state = selected ? "yours" : pending ? "checking" : cell.soldShare >= 0.6 ? "busy" : "open";
          const name = `${DAYS[day]} ${time.label.toLowerCase()}, ${heat ? `${Math.round(cell.soldShare * 100)}% sold` : state}`;
          return onSelect ? <button type="button" key={day} className={`time-cell is-${tone}`} aria-label={name} aria-pressed={selected}
            onClick={() => onSelect({ kind: "cell", day, block })}>
            <span className="cell-mark" aria-hidden="true">{selected && <Tick />}</span>
          </button> : <span key={day} role="img" className={`time-cell is-${tone}`} aria-label={name}>
            {heat ? <span aria-hidden="true">{Math.round(cell.soldShare * 100)}%</span> : selected ? <span className="cell-mark" aria-hidden="true"><Tick /></span> : null}
          </span>;
        })}
      </Fragment>;
    })}
  </div>;
}
