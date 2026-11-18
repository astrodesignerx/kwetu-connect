import type { BookingSettings } from "@/lib/booking/settings";
import SettingsRuleIcon from "./SettingsRuleIcon";
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
export type Section = "price" | "discounts" | "capacity" | "lengths" | "often" | "lead" | "blocks" | "hours";
export const TITLES: Record<Section, string> = { price: "Price", discounts: "Discounts", capacity: "For sale each hour", lengths: "Lengths", often: "Plays an hour", lead: "Booking lead", blocks: "Time blocks", hours: "Screen hours" };

const n = (value: number) => value.toLocaleString("en-GB");
const hh = (hour: number) => String(hour).padStart(2, "0");
/** "Mon to Thu 06 to 22, Fri to Sun 06 to 24": consecutive days with the same hours are grouped. */
function hourGroups(hours: BookingSettings["screenHours"]) {
  const groups: { from: number; to: number; open: number; close: number }[] = [];
  for (const day of WEEK) {
    const h = hours[day]; const last = groups[groups.length - 1];
    if (last && last.open === h.open && last.close === h.close) last.to = day;
    else groups.push({ from: day, to: day, open: h.open, close: h.close });
  }
  return groups;
}
function hoursSummary(hours: BookingSettings["screenHours"]) {
  return hourGroups(hours).map((g) => (g.from === g.to ? SHORT[g.from] : SHORT[g.from] + " to " + SHORT[g.to]) + (g.open >= g.close ? " closed" : " " + hh(g.open) + " to " + hh(g.close))).join(", ");
}

/** "Fri to Sun" or "Mon, Wed": days (Monday first) as short names, runs of three or more joined with "to". */
function dayList(days: number[]) {
  const runs: number[][] = [];
  for (const day of WEEK.filter((d) => days.includes(d))) { const last = runs[runs.length - 1]; if (last && WEEK.indexOf(day) === WEEK.indexOf(last[last.length - 1]) + 1) last.push(day); else runs.push([day]); }
  return runs.map((run) => run.length > 2 ? SHORT[run[0]] + " to " + SHORT[run[run.length - 1]] : run.map((d) => SHORT[d]).join(", ")).join(", ");
}

export default function SettingsRuleTiles({ candidate, open, onSelect }: { candidate: BookingSettings; open: Section | null; onSelect: (section: Section | null) => void }) {
  const steps = [...candidate.discountSteps].sort((a, b) => a.minPlays - b.minPlays);
  const topDiscount = Math.max(1, ...steps.map((s) => s.percent));
  const lens = [...candidate.lengths].filter(Number.isFinite).sort((a, b) => a - b);
  const sortedOften = [...candidate.howOften].sort((a, b) => a.plays - b.plays);
  const plays = sortedOften.map((o) => o.plays);
  const saleMinutes = Number((candidate.secondsForSalePerHour / 60).toFixed(1));
  // A rule is only stated when the hours really follow it: the late block open on some days but not all.
  const late = candidate.timeBlocks.late;
  const lateDays = late ? WEEK.filter((day) => candidate.screenHours[day].close > late.startHour && candidate.screenHours[day].open < late.endHour) : [];
  const hoursRule = late && lateDays.length > 0 && lateDays.length < 7 ? `${late.label} block runs ${dayList(lateDays)} only` : "";
  const oftenNote = sortedOften.length > 1
    ? `${sortedOften[0].label} to ${sortedOften[sortedOften.length - 1].label.toLowerCase()}`
    : sortedOften.length === 1
      ? sortedOften[0].label
      : "";
  const tiles: { id: Section; value: React.ReactNode; sig: string; note: string; aside?: string; wide?: boolean }[] = [
    { id: "price", value: <>KES {n(candidate.kesPerSecond)} <small>a second</small></>, sig: String(candidate.kesPerSecond), note: `Smallest order KES ${n(candidate.minOrderKes)}` },
    { id: "discounts", value: steps.length ? `${steps.map((s) => s.percent).join(" / ")}% off, from ${n(steps[0].minPlays)} plays` : "No discount steps", sig: steps.map((s) => s.percent).join(), aside: "by plays booked", note: "" },
    { id: "capacity", value: `${n(saleMinutes)} min`, sig: String(candidate.secondsForSalePerHour), note: `Up to ${candidate.maxPlaysPerAdvertiserPerHour} plays per advertiser` },
    { id: "lengths", value: lens.length ? `${lens[0]} to ${lens[lens.length - 1]}s` : "None", sig: lens.join(), note: `${lens.length} ${lens.length === 1 ? "length" : "lengths"} on offer` },
    { id: "often", value: plays.length ? `${plays[0]} to ${plays[plays.length - 1]}` : "None", sig: plays.join(), note: oftenNote },
    { id: "lead", value: `${candidate.leadWorkingDays} ${candidate.leadWorkingDays === 1 ? "day" : "days"}`, sig: String(candidate.leadWorkingDays), note: "Before the first play" },
    { id: "blocks", value: `${Object.keys(candidate.timeBlocks).length} blocks`, sig: "blocks", note: "" },
    { id: "hours", value: hoursSummary(candidate.screenHours), sig: hoursSummary(candidate.screenHours), note: "", aside: hoursRule, wide: true },
  ];

  return <div className="settings-tiles" role="group" aria-label="Rules">{tiles.map((tile) => {
    const isPressed = open === tile.id;
    return <button key={tile.id} type="button" className={`settings-tile${tile.wide ? " is-wide" : ""}`} data-section={tile.id} aria-pressed={isPressed} aria-controls="settings-panel" onClick={() => onSelect(isPressed ? null : tile.id)}>
      <span className="settings-tile-label"><span className="v2-setting-icon"><SettingsRuleIcon name={tile.id} /></span>{TITLES[tile.id]}<span className="mg-rule-edit"><SettingsRuleIcon name="pencil" />{isPressed && <span>Editing</span>}</span></span>
      {tile.aside && <small className="settings-tile-aside">{tile.aside}</small>}
      <strong key={tile.sig}>{tile.value}</strong>
      {tile.id === "price" && <span className="v2-rule-chips mg-price-lengths" aria-hidden="true">{lens.slice(0, 3).map((length, index) => <span key={`${index}-${length}`}>KES {n(length * candidate.kesPerSecond)}<small>{length}s / play</small></span>)}</span>}
      {tile.id === "lengths" && <span className="v2-rule-chips" aria-hidden="true">{lens.map((length, index) => <span key={`${index}-${length}`}>{length}s</span>)}</span>}
      {tile.id === "often" && <span className="v2-rule-chips" aria-hidden="true">{plays.map((play, index) => <span key={`${index}-${play}`}>{play}</span>)}</span>}
      {tile.id === "blocks" && <span className="v2-rule-chips" aria-hidden="true">{Object.entries(candidate.timeBlocks).map(([id, block]) => <span key={id}>{block.label} {hh(block.startHour)} to {hh(block.endHour)}</span>)}</span>}
      {tile.id === "capacity" && <span className="mg-rule-visual" aria-hidden="true"><span className="mg-rule-capacity"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, candidate.secondsForSalePerHour / 3600))})` }} /></span><span className="mg-lead-labels"><span>{n(candidate.secondsForSalePerHour)} s for sale</span><span>60 min</span></span></span>}
      {tile.id === "lead" && <span className="mg-rule-visual" aria-hidden="true"><span className="mg-lead-line">{Array.from({ length: Math.max(1, Math.min(12, candidate.leadWorkingDays)) + 1 }, (_, index) => <i key={index} />)}</span><span className="mg-lead-labels"><span>Booked</span><span>First play</span></span></span>}
      {tile.id === "discounts" && <span className="v2-discount-stair" aria-hidden="true">{[{ minPlays: 0, percent: 0 }, ...steps].map((step, index) => <span key={`${index}-${step.minPlays}-${step.percent}`}><i style={{ "--p": step.percent ? Number((step.percent / topDiscount).toFixed(3)) : 0 } as React.CSSProperties}>{step.percent}%</i><small>{step.minPlays ? n(step.minPlays) : (steps.length ? "Under " + n(steps[0].minPlays) : "All orders")}</small></span>)}</span>}
      {tile.id === "hours" && <span className="v2-screen-hours" aria-hidden="true"><span />{Array.from({ length: 24 }, (_, hour) => <small key={hour}>{hour % 3 === 0 ? hh(hour) : ""}</small>)}{hourGroups(candidate.screenHours).map((group) => <span className="v2-screen-hour-row" key={group.from}><span>{SHORT[group.from]}{group.from !== group.to ? " to " + SHORT[group.to] : ""}</span>{Array.from({ length: 24 }, (_, hour) => <i key={hour} data-open={hour >= group.open && hour < group.close} />)}</span>)}</span>}
      {tile.note && <span className="settings-tile-note">{tile.note}</span>}
    </button>;
  })}</div>;
}
