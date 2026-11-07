"use client";
import { useActionState, useState } from "react";
import { Clock, Coins, FilmStrip, Hourglass, Percent, Play, Timer, X } from "@phosphor-icons/react";
import { saveSettings } from "@/app/manage/actions";
import type { BookingSettings } from "@/lib/booking/settings";
import { quote } from "@/lib/booking/quote";
import { validateSettings } from "@/lib/store/validation";
import { RULEBOOK_EXAMPLES } from "@/lib/store/examples";

// Settings, concept C "Summary first" (2026-11-05): the page reads as a fact sheet of how the screen is sold.
// Tap a tile to edit that part in the side panel, which shows the impact on the rulebook examples before saving.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
type Section = "price" | "discounts" | "capacity" | "lengths" | "often" | "lead" | "blocks" | "hours";
const TITLES: Record<Section, string> = { price: "Price", discounts: "Discounts", capacity: "Sold per hour", lengths: "Lengths", often: "Plays an hour", lead: "Booking lead", blocks: "Time blocks", hours: "Screen hours" };
const ICONS = { price: Coins, discounts: Percent, capacity: Hourglass, lengths: FilmStrip, often: Play, lead: Timer, blocks: Clock, hours: Clock };
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

export default function SettingsEditor({ initial }: { initial: BookingSettings }) {
  const [settings, setSettings] = useState(initial);
  const [lengths, setLengths] = useState(initial.lengths.join(", "));
  const [holidays, setHolidays] = useState(initial.publicHolidays.join("\n"));
  const [open, setOpen] = useState<Section | null>("price");
  const [state, action, pending] = useActionState(saveSettings, { message: "" });
  const candidate = { ...settings, lengths: lengths.split(",").filter((v) => v.trim()).map(Number), publicHolidays: holidays.split(/[\n,]/).map((d) => d.trim()).filter(Boolean) };
  let error = "";
  try { validateSettings(candidate); } catch (e) { error = e instanceof Error ? e.message : "Check your settings."; }
  const unsaved = JSON.stringify(candidate) !== JSON.stringify(initial);
  function update(change: (next: BookingSettings) => void) { setSettings((current) => { const next = structuredClone(current); change(next); return next; }); }

  const steps = [...candidate.discountSteps].sort((a, b) => a.minPlays - b.minPlays);
  const lens = [...candidate.lengths].filter(Number.isFinite).sort((a, b) => a - b);
  const plays = candidate.howOften.map((o) => o.plays).sort((a, b) => a - b);
  const tiles: { id: Section; value: string; note: string; wide?: boolean }[] = [
    { id: "price", value: `KES ${n(candidate.kesPerSecond)} / s`, note: `Smallest order ${n(candidate.minOrderKes)}` },
    { id: "discounts", value: steps.length ? steps.map((s) => s.percent).join(" / ") + "%" : "None", note: steps.length ? `From ${n(steps[0].minPlays)} plays` : "No discount steps" },
    { id: "capacity", value: `${n(Math.round(candidate.secondsForSalePerHour / 60))} min`, note: `Max ${candidate.maxPlaysPerAdvertiserPerHour} plays each` },
    { id: "lengths", value: lens.length ? `${lens[0]} to ${lens[lens.length - 1]}s` : "None", note: `${lens.length} choices` },
    { id: "often", value: plays.length ? `${plays[0]} to ${plays[plays.length - 1]}` : "None", note: `${plays.length} choices` },
    { id: "lead", value: `${candidate.leadWorkingDays} ${candidate.leadWorkingDays === 1 ? "day" : "days"}`, note: `${candidate.publicHolidays.length} holidays set` },
    { id: "blocks", value: `${Object.keys(candidate.timeBlocks).length} blocks`, note: Object.values(candidate.timeBlocks).map((block) => block.label).join(", ") },
    { id: "hours", value: hoursSummary(candidate.screenHours), note: `${Object.keys(candidate.timeBlocks).length} time blocks, ${Object.values(candidate.timeBlocks).map((b) => b.label).join(", ")}`, wide: true },
  ];

  const field = (key: keyof Pick<BookingSettings, "kesPerSecond" | "minOrderKes" | "secondsForSalePerHour" | "maxPlaysPerAdvertiserPerHour" | "leadWorkingDays">, label: string) =>
    <label key={key}>{label}<input type="number" min={1} step={1} required value={settings[key]} onChange={(e) => update((s) => { s[key] = Number(e.target.value); })} /></label>;

  const editors: Record<Section, React.ReactNode> = {
    blocks: <>{(Object.keys(settings.timeBlocks) as (keyof BookingSettings["timeBlocks"])[]).map((id) => <div key={id} className="settings-row is-block"><input aria-label={`${id} label`} value={settings.timeBlocks[id].label} maxLength={80} onChange={(e) => update((s) => { s.timeBlocks[id].label = e.target.value; })} /><input aria-label={`${id} start hour`} type="number" min={0} max={23} step={1} value={settings.timeBlocks[id].startHour} onChange={(e) => update((s) => { s.timeBlocks[id].startHour = Number(e.target.value); })} /><input aria-label={`${id} end hour`} type="number" min={1} max={24} step={1} value={settings.timeBlocks[id].endHour} onChange={(e) => update((s) => { s.timeBlocks[id].endHour = Number(e.target.value); })} /></div>)}</>,
    price: <>{field("kesPerSecond", "KES per second")}{field("minOrderKes", "Smallest order (KES)")}</>,
    capacity: <>{field("secondsForSalePerHour", "Seconds for sale per hour")}{field("maxPlaysPerAdvertiserPerHour", "Maximum plays per advertiser per hour")}</>,
    lengths: <label>Available lengths in seconds, separated by commas<input value={lengths} onChange={(e) => setLengths(e.target.value)} required /><span className="settings-hint">Use multiples of 5 seconds.</span></label>,
    lead: <>{field("leadWorkingDays", "Lead working days")}<label>Public holidays, one per line (YYYY-MM-DD)<textarea rows={4} value={holidays} onChange={(e) => setHolidays(e.target.value)} /></label></>,
    discounts: <>{settings.discountSteps.map((step, index) => <div key={index} className="settings-row">
      <label>From plays<input type="number" min={1} step={1} value={step.minPlays} onChange={(e) => update((s) => { s.discountSteps[index].minPlays = Number(e.target.value); })} /></label>
      <label>Percent off<input type="number" min={1} max={99} step={1} value={step.percent} onChange={(e) => update((s) => { s.discountSteps[index].percent = Number(e.target.value); })} /></label>
      <button type="button" className="settings-remove" aria-label={`Remove step ${index + 1}`} onClick={() => update((s) => { s.discountSteps.splice(index, 1); })}><X size={14} aria-hidden="true" /></button>
    </div>)}<button type="button" className="settings-add" onClick={() => update((s) => { s.discountSteps.push({ minPlays: 1, percent: 1 }); })}>+ Add step</button><span className="settings-hint">Highest plays and percent first.</span></>,
    often: <>{settings.howOften.map((option, index) => <div key={index} className="settings-row">
      <label>Plays an hour<input type="number" min={1} step={1} value={option.plays} onChange={(e) => update((s) => { s.howOften[index].plays = Number(e.target.value); })} /></label>
      <label>Label<input value={option.label} maxLength={80} onChange={(e) => update((s) => { s.howOften[index].label = e.target.value; })} /></label>
      <button type="button" className="settings-remove" aria-label={`Remove choice ${index + 1}`} onClick={() => update((s) => { s.howOften.splice(index, 1); })}><X size={14} aria-hidden="true" /></button>
    </div>)}<button type="button" className="settings-add" onClick={() => update((s) => { s.howOften.push({ plays: 1, label: "" }); })}>+ Add choice</button></>,
    hours: <><p className="settings-sub">Open and close, whole hours 0 to 24</p>{WEEK.map((index) => <div key={index} className="settings-row is-hours"><span>{DAYS[index]}</span>
      <input aria-label={`${DAYS[index]} open`} type="number" min={0} max={23} step={1} value={settings.screenHours[index].open} onChange={(e) => update((s) => { s.screenHours[index].open = Number(e.target.value); })} />
      <input aria-label={`${DAYS[index]} close`} type="number" min={1} max={24} step={1} value={settings.screenHours[index].close} onChange={(e) => update((s) => { s.screenHours[index].close = Number(e.target.value); })} />
    </div>)}<p className="settings-sub">Time blocks: label, start and end hour</p>{(Object.keys(settings.timeBlocks) as (keyof BookingSettings["timeBlocks"])[]).map((id) => <div key={id} className="settings-row is-block">
      <input aria-label={`${id} label`} value={settings.timeBlocks[id].label} maxLength={80} onChange={(e) => update((s) => { s.timeBlocks[id].label = e.target.value; })} />
      <input aria-label={`${id} start hour`} type="number" min={0} max={23} step={1} value={settings.timeBlocks[id].startHour} onChange={(e) => update((s) => { s.timeBlocks[id].startHour = Number(e.target.value); })} />
      <input aria-label={`${id} end hour`} type="number" min={1} max={24} step={1} value={settings.timeBlocks[id].endHour} onChange={(e) => update((s) => { s.timeBlocks[id].endHour = Number(e.target.value); })} />
    </div>)}</>,
  };

  return <form action={action} className="staff-form settings-c">
    <input type="hidden" name="settings" value={JSON.stringify(candidate)} />
    <div className="settings-tiles">{tiles.map((tile) => { const Icon = ICONS[tile.id]; return <button key={tile.id} type="button" className={`settings-tile${tile.wide ? " is-wide" : ""}`} data-section={tile.id} aria-pressed={open === tile.id} aria-controls="settings-panel" onClick={() => setOpen(open === tile.id ? null : tile.id)}>
      <span className="settings-tile-label"><span className="v2-setting-icon"><Icon size={17} aria-hidden="true" /></span>{TITLES[tile.id]}</span><strong key={tile.value}>{tile.value}</strong><span className="settings-tile-note">{open === tile.id ? "Editing" : tile.note}</span>
      {(tile.id === "lengths" || tile.id === "often" || tile.id === "blocks") && <span className="v2-rule-chips" aria-hidden="true">{(tile.id === "lengths" ? lens.map((length) => length + "s") : tile.id === "often" ? plays.map(String) : Object.values(candidate.timeBlocks).map((block) => `${block.label} ${hh(block.startHour)} to ${hh(block.endHour)}`)).map((label) => <span key={label}>{label}</span>)}</span>}
      {tile.id === "discounts" && <span className="v2-discount-stair" aria-hidden="true">{[{ minPlays: 0, percent: 0 }, ...steps].map((step) => <span key={step.minPlays + ":" + step.percent}><i style={{ height: `${18 + Math.min(99, step.percent) * 1.2}px` }}>{step.percent}%</i><small>{step.minPlays ? n(step.minPlays) : "Base"}</small></span>)}</span>}
      {tile.id === "hours" && <span className="v2-screen-hours" aria-hidden="true"><span />{Array.from({ length: 24 }, (_, hour) => <small key={hour}>{hour % 3 === 0 ? hh(hour) : ""}</small>)}{hourGroups(candidate.screenHours).map((group) => <span className="v2-screen-hour-row" key={group.from}><span>{SHORT[group.from]}{group.from !== group.to ? " to " + SHORT[group.to] : ""}</span>{Array.from({ length: 24 }, (_, hour) => <i key={hour} data-open={hour >= group.open && hour < group.close} />)}</span>)}</span>}
    </button>; })}</div>
    <aside id="settings-panel" className="settings-panel" aria-label="Edit settings" data-open={open !== null}>
      <fieldset disabled={pending} className="settings-fields" key={open ?? "none"}>
        {open ? <><div className="settings-panel-head"><h2>{TITLES[open]}</h2><button type="button" className="settings-remove" aria-label="Close panel" onClick={() => setOpen(null)}><X size={14} aria-hidden="true" /></button></div>{editors[open]}</>
          : <p className="settings-sub">Pick a tile to change it. New quotes use these settings; quotes already made keep their price.</p>}
      </fieldset>
      <div className="settings-impact"><b>Impact on the rulebook examples</b>
        {error ? <p role="alert" className="settings-error">{error}</p> : RULEBOOK_EXAMPLES.map((example) => {
          const before = quote(example.request, initial); const after = quote(example.request, candidate);
          const changed = before.ok && after.ok && before.priceKes !== after.priceKes;
          return <div key={example.name} className="settings-example"><span>{example.name}</span>
            <span>{after.ok ? <>{changed && before.ok && <s>KES {n(before.priceKes)}</s>} <b data-changed={changed}>KES {n(after.priceKes)}</b>{after.belowMinimum ? " below smallest order" : ""}</> : after.errors.join(" ")}</span></div>;
        })}
      </div>
      <button className="staff-button" disabled={Boolean(error) || !unsaved || pending}>{pending ? "Saving..." : unsaved ? "Save changes" : "No changes"}</button>
      <p role="status" className="settings-status">{state.message}</p>
    </aside>
  </form>;
}
