"use client";
import { useActionState, useState } from "react";
import { X } from "@phosphor-icons/react";
import SettingsRuleTiles, { TITLES, type Section } from "./SettingsRuleTiles";
import { saveSettings } from "@/app/manage/actions";
import type { BookingSettings } from "@/lib/booking/settings";
import { quote } from "@/lib/booking/quote";
import { validateSettings } from "@/lib/store/validation";
import { RULEBOOK_EXAMPLES } from "@/lib/store/examples";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const HINTS: Record<Section, string> = {
  price: "Price per second and minimum order.",
  discounts: "Applies to the whole order when its play threshold is reached.",
  capacity: "Saleable seconds and maximum plays per advertiser, per hour.",
  lengths: "Available advert lengths.",
  often: "Available plays per hour.",
  lead: "Working days before the first play, excluding listed public holidays.",
  blocks: "Hour groups offered when booking.",
  hours: "Screen opening hours and time blocks.",
};
const n = (value: number) => value.toLocaleString("en-GB");

/** A number field with its unit inside the box on the right. */
const Unit = ({ unit, children }: { unit: string; children: React.ReactNode }) => <span className="settings-input">{children}<em aria-hidden="true">{unit}</em></span>;

export default function SettingsEditor({ initial, activeBookings }: { initial: BookingSettings; activeBookings: number }) {
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

  const field = (key: keyof Pick<BookingSettings, "kesPerSecond" | "minOrderKes" | "secondsForSalePerHour" | "maxPlaysPerAdvertiserPerHour" | "leadWorkingDays">, label: string, unit: string) =>
    <label key={key}>{label}<Unit unit={unit}><input type="number" min={1} step={1} required value={settings[key]} onChange={(e) => update((s) => { s[key] = Number(e.target.value); })} /></Unit></label>;

  const editors: Record<Section, React.ReactNode> = {
    blocks: <>{(Object.keys(settings.timeBlocks) as (keyof BookingSettings["timeBlocks"])[]).map((id) => <div key={id} className="settings-row is-block"><input aria-label={`${id} label`} value={settings.timeBlocks[id].label} maxLength={80} onChange={(e) => update((s) => { s.timeBlocks[id].label = e.target.value; })} /><input aria-label={`${id} start hour`} type="number" min={0} max={23} step={1} value={settings.timeBlocks[id].startHour} onChange={(e) => update((s) => { s.timeBlocks[id].startHour = Number(e.target.value); })} /><input aria-label={`${id} end hour`} type="number" min={1} max={24} step={1} value={settings.timeBlocks[id].endHour} onChange={(e) => update((s) => { s.timeBlocks[id].endHour = Number(e.target.value); })} /></div>)}</>,
    price: <>{field("kesPerSecond", "KES per second", "KES")}{field("minOrderKes", "Smallest order", "KES")}</>,
    capacity: <>{field("secondsForSalePerHour", "Seconds for sale per hour", "s")}{field("maxPlaysPerAdvertiserPerHour", "Maximum plays per advertiser per hour", "plays an hour")}</>,
    lengths: <label>Available lengths in seconds, separated by commas<Unit unit="s"><input value={lengths} onChange={(e) => setLengths(e.target.value)} required /></Unit><span className="settings-hint">Use multiples of 5 seconds.</span></label>,
    lead: <>{field("leadWorkingDays", "Lead working days", "days")}<label>Public holidays, one per line (YYYY-MM-DD), {candidate.publicHolidays.length} set<textarea rows={4} value={holidays} onChange={(e) => setHolidays(e.target.value)} /></label></>,
    discounts: <>{settings.discountSteps.map((step, index) => <div key={index} className="settings-row">
      <label>From plays<Unit unit="plays"><input type="number" min={1} step={1} value={step.minPlays} onChange={(e) => update((s) => { s.discountSteps[index].minPlays = Number(e.target.value); })} /></Unit></label>
      <label>Percent off<Unit unit="%"><input type="number" min={1} max={99} step={1} value={step.percent} onChange={(e) => update((s) => { s.discountSteps[index].percent = Number(e.target.value); })} /></Unit></label>
      <button type="button" className="settings-remove" aria-label={`Remove step ${index + 1}`} onClick={() => update((s) => { s.discountSteps.splice(index, 1); })}><X size={14} aria-hidden="true" /></button>
    </div>)}<button type="button" className="settings-add" onClick={() => update((s) => { s.discountSteps.push({ minPlays: 1, percent: 1 }); })}>+ Add step</button><span className="settings-hint">Highest plays and percent first.</span></>,
    often: <>{settings.howOften.map((option, index) => <div key={index} className="settings-row">
      <label>Plays an hour<Unit unit="plays"><input type="number" min={1} step={1} value={option.plays} onChange={(e) => update((s) => { s.howOften[index].plays = Number(e.target.value); })} /></Unit></label>
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
    <SettingsRuleTiles candidate={candidate} open={open} onSelect={setOpen} />
    <aside id="settings-panel" className="settings-panel" aria-label="Edit settings" data-open={open !== null}>
      <fieldset disabled={pending} className="settings-fields" key={open ?? "none"}>
        {open ? <><div className="settings-panel-head"><h2>Editing <span>{TITLES[open]}</span></h2><span className="settings-state" data-draft={unsaved}>{unsaved ? "Draft" : "Saved"}</span><button type="button" className="settings-remove" aria-label="Close panel" onClick={() => setOpen(null)}><X size={14} aria-hidden="true" /></button></div><p className="settings-sub">{HINTS[open]}</p>{editors[open]}</>
          : <p className="settings-sub">New quotes use these settings. Existing bookings keep their price.</p>}
      </fieldset>
      <div className="settings-impact"><b>Sample orders</b>
        {error ? <p role="alert" className="settings-error">{error}</p> : RULEBOOK_EXAMPLES.map((example) => {
          const before = quote(example.request, initial); const after = quote(example.request, candidate);
          const changed = before.ok && after.ok && before.priceKes !== after.priceKes;
          return <div key={example.name} className="settings-example"><span>{after.ok ? `${n(after.plays)} plays x ${example.request.lengthSeconds}s, ${after.discountPercent ? after.discountPercent + "% off" : "no discount"}` : example.name}</span>
            <span>{after.ok ? <>{changed && before.ok && <s>KES {n(before.priceKes)}</s>} <b data-changed={changed}>KES {n(after.priceKes)}</b>{after.belowMinimum ? " below smallest order" : ""}</> : after.errors.join(" ")}</span></div>;
        })}
      </div>
      <div className="settings-applies"><b>Where this rule applies</b>
        <div><span>Public booking page</span><span>/book live calculator</span></div>
        <div><span>New quote button</span><span>New quotes only</span></div>
        <div><span>Active bookings</span><span>{n(activeBookings)} keep {activeBookings === 1 ? "its" : "their"} booked price</span></div>
      </div>
      <div className="settings-footer">
        <button className="staff-button mg-primary" disabled={Boolean(error) || !unsaved || pending}>{pending ? "Saving..." : unsaved ? "Save changes" : "No changes to save"}</button>
        <button type="button" className="settings-reset" disabled={!unsaved || pending} onClick={() => { setSettings(initial); setLengths(initial.lengths.join(", ")); setHolidays(initial.publicHolidays.join("\n")); }}>Reset</button>
      </div>

      <p role="status" className="settings-status">{state.message}</p>
    </aside>
  </form>;
}
