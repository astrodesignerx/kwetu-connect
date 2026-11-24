"use client";
import { useState } from "react";
import { readAnswers } from "@/lib/booking/answers";
import { earliestStartDate } from "@/lib/booking/hours";
import { fromCells, DAY_ORDER, BLOCK_ORDER } from "@/lib/booking/selection";
import { quickQuote } from "@/lib/mail/kca";
import type { BookingSettings } from "@/lib/booking/settings";
import { money, bookingDates } from "./mail-format";

export default function QuickQuote({ settings, today, onInsert }: { settings:BookingSettings; today:string; onInsert:(text:string)=>void }) {
  const [request,setRequest] = useState(() => readAnswers({},today,settings));
  const value = quickQuote(request,settings), earliest=earliestStartDate(today,settings);
  const available = request.startDate >= earliest;
  const update = (next:Partial<typeof request>) => setRequest((r) => ({...r,...next}));
  return <details className="mail-card mail-quote"><summary>Quick quote</summary><p>Estimate only. Availability is checked on /book.</p>
    <label>Length<select value={request.lengthSeconds} onChange={(e) => update({lengthSeconds:Number(e.target.value)})}>{settings.lengths.map((n) => <option key={n} value={n}>{n} seconds</option>)}</select></label>
    <label>Plays an hour<select value={request.howOften} onChange={(e) => update({howOften:Number(e.target.value)})}>{settings.howOften.map((o) => <option key={o.plays} value={o.plays}>{o.plays} | {o.label}</option>)}</select></label>
    <fieldset><legend>Days and time blocks</legend><div className="mail-quote-cells">{DAY_ORDER.map((day) => <div key={day}><b>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]}</b>{BLOCK_ORDER.map((block) => { const key=`${day}-${block}`; const checked=request.cells?.includes(key) ?? false; const hours=settings.screenHours[day], times=settings.timeBlocks[block]; const closed=!hours || times.startHour>=hours.close || times.endHour<=hours.open; return <label key={key}><input type="checkbox" checked={checked} disabled={closed} onChange={() => update(fromCells(checked ? request.cells!.filter((c) => c!==key) : [...request.cells ?? [],key]))} />{times.label}</label>; })}</div>)}</div></fieldset>
    <label>Start date<input type="date" min={earliest} value={request.startDate} onChange={(e) => update({startDate:e.target.value})} /></label><label>End date<input type="date" min={request.startDate} value={request.endDate} onChange={(e) => update({endDate:e.target.value})} /></label>
    {!available && <p role="alert">Choose a start date on or after {bookingDates(earliest)}.</p>}
    {value.result.ok ? <><p>{value.result.plays.toLocaleString("en-GB")} plays | <b>{money(value.result.priceKes)}</b></p>{value.result.belowMinimum && <p>Below the minimum order of {money(settings.minOrderKes)}. Extend the plan.</p>}<button type="button" disabled={!available || value.result.belowMinimum} onClick={() => onInsert(value.reply)}>Insert price reply</button><p><a href={value.href}>Open this plan in /book</a></p></> : <p role="alert">{value.result.errors.join(" ")}</p>}
  </details>;
}
