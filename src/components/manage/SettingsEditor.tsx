"use client";
import { useActionState, useState } from "react";
import { saveSettings } from "@/app/manage/actions";
import type { BookingSettings } from "@/lib/booking/settings";
import { quote } from "@/lib/booking/quote";
import { validateSettings } from "@/lib/store/validation";
import { RULEBOOK_EXAMPLES } from "@/lib/store/examples";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SCALARS = [
  ["kesPerSecond", "KES per second"], ["minOrderKes", "Smallest order (KES)"],
  ["secondsForSalePerHour", "Seconds for sale per hour"], ["maxPlaysPerAdvertiserPerHour", "Maximum plays per advertiser per hour"], ["leadWorkingDays", "Lead working days"],
] as const;
export default function SettingsEditor({ initial }: { initial: BookingSettings }) {
  const [settings, setSettings] = useState(initial);
  const [lengths, setLengths] = useState(initial.lengths.join(", "));
  const [holidays, setHolidays] = useState(initial.publicHolidays.join("\n"));
  const [state, action, pending] = useActionState(saveSettings, { message: "" });
  const candidate = { ...settings, lengths: lengths.split(",").filter((n) => n.trim()).map(Number), publicHolidays: holidays.split(/[\n,]/).map((d) => d.trim()).filter(Boolean) };
  let error = "";
  try { validateSettings(candidate); } catch (e) { error = e instanceof Error ? e.message : "Check your settings."; }
  function update(change: (next: BookingSettings) => void) { setSettings((current) => { const next = structuredClone(current); change(next); return next; }); }
  return <form action={action} className="staff-form space-y-6">
    <input type="hidden" name="settings" value={JSON.stringify(candidate)} />
    <fieldset disabled={pending} className="min-w-0 space-y-6">
      <section className="staff-card grid gap-4 sm:grid-cols-2">{SCALARS.map(([key, label]) => <label key={key}>{label}<input type="number" min={1} step={1} required value={settings[key]} onChange={(e) => update((s) => { s[key] = Number(e.target.value); })} /></label>)}
        <label>Available lengths in seconds, separated by commas<input value={lengths} onChange={(e) => setLengths(e.target.value)} required /><span className="text-xs text-gray-600">Use multiples of 5 seconds.</span></label>
      </section>
      <section className="staff-card space-y-4"><h2>Discount steps</h2><p className="text-sm text-gray-600">Highest plays and percent first.</p>{settings.discountSteps.map((step, index) => <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label>Minimum plays<input type="number" min={1} step={1} value={step.minPlays} onChange={(e) => update((s) => { s.discountSteps[index].minPlays = Number(e.target.value); })} /></label>
        <label>Discount percent<input type="number" min={1} max={99} step={1} value={step.percent} onChange={(e) => update((s) => { s.discountSteps[index].percent = Number(e.target.value); })} /></label>
        <button type="button" className="staff-link underline" onClick={() => update((s) => { s.discountSteps.splice(index, 1); })}>Remove step {index + 1}</button>
      </div>)}<button type="button" className="staff-button" onClick={() => update((s) => { s.discountSteps.push({ minPlays: 1, percent: 1 }); })}>Add discount step</button></section>
      <section className="staff-card space-y-4"><h2>How often choices</h2>{settings.howOften.map((option, index) => <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <label>Plays an hour<input type="number" min={1} step={1} value={option.plays} onChange={(e) => update((s) => { s.howOften[index].plays = Number(e.target.value); })} /></label>
        <label>Label<input value={option.label} maxLength={80} onChange={(e) => update((s) => { s.howOften[index].label = e.target.value; })} /></label>
        <button type="button" className="staff-link underline" onClick={() => update((s) => { s.howOften.splice(index, 1); })}>Remove choice {index + 1}</button>
      </div>)}<button type="button" className="staff-button" onClick={() => update((s) => { s.howOften.push({ plays: 1, label: "" }); })}>Add how often choice</button></section>
      <section className="staff-card space-y-4"><h2>Screen hours</h2><p className="text-sm text-gray-600">Use whole hours from 0 to 24.</p>{DAYS.map((day, index) => <div key={day} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr]"><p className="col-span-2 sm:col-span-1">{day}</p>
        <label>Open<input aria-label={`${day} open`} type="number" min={0} max={23} step={1} value={settings.screenHours[index].open} onChange={(e) => update((s) => { s.screenHours[index].open = Number(e.target.value); })} /></label>
        <label>Close<input aria-label={`${day} close`} type="number" min={1} max={24} step={1} value={settings.screenHours[index].close} onChange={(e) => update((s) => { s.screenHours[index].close = Number(e.target.value); })} /></label>
      </div>)}</section>
      <section className="staff-card space-y-4"><h2>Time blocks</h2>{(Object.keys(settings.timeBlocks) as (keyof BookingSettings["timeBlocks"])[]).map((id) => <div key={id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label className="col-span-2 sm:col-span-1">{id} label<input value={settings.timeBlocks[id].label} maxLength={80} onChange={(e) => update((s) => { s.timeBlocks[id].label = e.target.value; })} /></label>
        <label>Start hour<input aria-label={`${id} start hour`} type="number" min={0} max={23} step={1} value={settings.timeBlocks[id].startHour} onChange={(e) => update((s) => { s.timeBlocks[id].startHour = Number(e.target.value); })} /></label>
        <label>End hour<input aria-label={`${id} end hour`} type="number" min={1} max={24} step={1} value={settings.timeBlocks[id].endHour} onChange={(e) => update((s) => { s.timeBlocks[id].endHour = Number(e.target.value); })} /></label>
      </div>)}</section>
      <section className="staff-card"><h2>Public holidays</h2><label>Dates, one per line (YYYY-MM-DD)<textarea rows={4} value={holidays} onChange={(e) => setHolidays(e.target.value)} /></label></section>
      <section className="staff-card space-y-3"><h2>Rulebook examples</h2><p className="text-sm text-gray-600">These use the original example dates. Prices update before you save.</p>
        {error ? <p role="alert">{error}</p> : <div key={JSON.stringify(candidate)} className="animate-quote-in space-y-3 motion-reduce:animate-none">{RULEBOOK_EXAMPLES.map((example) => { const result = quote(example.request, candidate); return <div key={example.name} className="flex flex-wrap justify-between gap-2 border-b border-gray-200 pb-3"><strong>{example.name}</strong><span>{result.ok ? `${result.plays.toLocaleString("en-GB")} plays / KES ${result.priceKes.toLocaleString("en-GB")}${result.belowMinimum ? " / below smallest order" : ""}` : result.errors.join(" ")}</span></div>; })}</div>}
      </section>
      <button className="staff-button" disabled={Boolean(error)}>{pending ? "Saving..." : "Save settings"}</button>
    </fieldset><p role="status">{state.message}</p>
  </form>;
}
