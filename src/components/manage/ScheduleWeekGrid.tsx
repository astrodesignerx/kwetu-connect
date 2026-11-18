"use client";
import type { CSSProperties } from "react";
import { formatHour } from "@/lib/booking/hours";
import type { BookingSettings } from "@/lib/booking/settings";
import { dayDate } from "@/lib/format/dates";
import type { HourTileRow } from "./V2Visuals";

export default function ScheduleWeekGrid({ rows, blocks, selected, today, onSelect }: { rows: HourTileRow[]; blocks: BookingSettings["timeBlocks"]; selected: { date: string; hour: number }; today: string; onSelect: (date: string, hour: number) => void }) {
  const hours = rows[0]?.hours.map((item) => item.hour) ?? [];
  const selectedRow = rows.find((row) => row.date === selected.date);
  const selectedHour = selectedRow?.hours.find((item) => item.hour === selected.hour);
  return <div className="mg-week-hours">
    <div className="v2-tile-legend"><span><i data-level="0" />Unsold</span><span><i data-level="1" />Below 40%</span><span><i data-level="2" />40 to 79%</span><span><i data-level="3" />80% or more</span><span><i data-closed="true" />Closed</span></div>
    <div className="mg-week-grid" style={{ "--hours": Math.max(1, hours.length) } as CSSProperties} role="group" aria-label="Planned time sold by day and hour">
      <span />{hours.map((hour) => { const block = Object.values(blocks).find((item) => hour >= item.startHour && hour < item.endHour); const starts = hour === hours[0] || block?.startHour === hour; const span = block ? hours.filter((item) => item >= hour && item < block.endHour).length : 1; return starts || !block ? <span className="mg-week-band" key={hour} style={{ gridColumn: "span " + span }} title={block?.label}>{block?.label ?? "Other hours"}</span> : null; })}
      <span />{hours.map((hour) => <span className="v2-hour-label" key={hour} data-on={hour === selected.hour}>{String(hour).padStart(2, "0")}</span>)}
      {rows.map((row) => <div className="v2-tile-row" key={row.date}><span className="mg-week-day" data-today={row.date === today}><b>{row.label}</b> <span>{Number(row.date.slice(-2))}</span></span>{row.hours.map((item) => <button type="button" key={item.hour} className="v2-hour-tile" data-level={!item.share ? 0 : item.share < .4 ? 1 : item.share < .8 ? 2 : 3} data-closed={item.closed} data-block-start={item.hour > hours[0] && Object.values(blocks).some((block) => block.startHour === item.hour)} aria-pressed={selected.date === row.date && selected.hour === item.hour} aria-label={dayDate(row.date) + " " + formatHour(item.hour) + ", " + (item.closed ? "screen closed" : Math.round(item.share * 100) + "% sold, planned")} onClick={() => onSelect(row.date, item.hour)}><span>{item.closed ? "" : Math.round(item.share * 100) + "%"}</span></button>)}</div>)}
    </div>
    <p className="v2-tile-readout" aria-live="polite">{selectedHour && selectedRow ? dayDate(selectedRow.date) + " / " + formatHour(selectedHour.hour) + " / " + (selectedHour.closed ? "Screen closed" : Math.round(selectedHour.share * 100) + "% sold, planned") : "Choose an hour to see planned time sold"}</p>
  </div>;
}
