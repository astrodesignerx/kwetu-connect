"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addDays, earliestStartDate, isValidDate } from "@/lib/booking/hours";
import { readAnswers, buildQuery, normaliseDays, normaliseBlocks, type Answers } from "@/lib/booking/answers";
import { occupancyByDayBlock, type Occupancy } from "@/lib/booking/occupancy";
import { toggleSelection } from "@/lib/booking/selection";
import { suggestPlan } from "@/lib/booking/plan";
import { quote } from "@/lib/booking/quote";
import type { BookingSettings } from "@/lib/booking/settings";
import Timetable, { TimetableLegend } from "./Timetable";
import QuoteTotals, { number } from "./QuoteTotals";
import Sheet from "./Sheet";
import BookingForm from "./BookingForm";
import ScreenPreview from "./ScreenPreview";
import SegmentedChoice from "./SegmentedChoice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export default function BookingQuote({ initialAnswers, initialOccupancy, today, settings }: {
  initialAnswers: Answers; initialOccupancy: Occupancy; today: string; settings: BookingSettings;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [sheet, setSheet] = useState<"dates" | "budget" | "quote" | "book">("dates");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetMessage, setBudgetMessage] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [availability, setAvailability] = useState<{ from: string; to: string; grid: Occupancy | null; error: string }>({ from: initialAnswers.startDate, to: initialAnswers.endDate, grid: initialOccupancy, error: "" });
  const [retry, setRetry] = useState(0);
  const { startDate: from, endDate: to } = answers;
  const query = buildQuery(answers);
  const earliest = earliestStartDate(today, settings);
  const rangeValid = from <= to && to <= addDays(from, 365);
  const result = useMemo(() => rangeValid ? quote(answers, settings) : { ok: false as const, errors: ["Choose dates in order, up to 366 days apart."] }, [answers, settings, rangeValid]);
  const availabilityCurrent = availability.from === from && availability.to === to;
  // Until busy hours for these dates are known, cells show as "checking", never as a guessed "open".
  const availabilityKnown = availabilityCurrent && availability.grid !== null;
  const occupancy = availabilityKnown ? availability.grid! : occupancyByDayBlock([], from, from <= to && to <= addDays(from, 365) ? to : from, settings);
  const weeks = (Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1) / 7;
  function openSheet(value: typeof sheet) { setSheet(value); setSheetOpen(true); }

  useEffect(() => {
    const nextUrl = `${window.location.pathname}?${query}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [query]);
  useEffect(() => {
    if (!rangeValid) return;
    const controller = new AbortController();
    fetch(`/book/occupancy?${new URLSearchParams({ from, to })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to refresh busy hours. Please try again.");
        const grid: Occupancy = await response.json();
        if (!controller.signal.aborted) setAvailability({ from, to, grid, error: "" });
      }).catch(() => {
        if (!controller.signal.aborted) setAvailability({ from, to, grid: null, error: "Unable to refresh busy hours. Please try again." });
      });
    return () => controller.abort();
  }, [from, to, rangeValid, retry, settings]);
  useEffect(() => {
    const restore = () => setAnswers(readAnswers(Object.fromEntries(new URLSearchParams(window.location.search)), today, settings));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [today, settings]);

  function change(partial: Partial<Answers>) {
    setAnswers((current) => ({ ...current, ...partial })); setBudgetMessage("");
  }
  function applyBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budgetKes = Math.floor(Number(budgetInput));
    if (!Number.isFinite(budgetKes) || budgetKes <= 0) { setBudgetMessage("Enter a budget in KES."); return; }
    const suggested = suggestPlan({ budgetKes }, { lengthSeconds: answers.lengthSeconds, startDate: from }, settings);
    if (!suggested.ok) { setBudgetMessage(suggested.reason); return; }
    setAnswers({ ...suggested.request, days: normaliseDays(suggested.request.days), blocks: normaliseBlocks(suggested.request.blocks) });
    setBudgetMessage(`We filled in ${number(suggested.quote.plays)} plays for KES ${number(suggested.quote.priceKes)}.`);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/book?${query}`); setCopyState("copied"); }
    catch { setCopyState("failed"); }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }
  const canBook = result.ok && !result.belowMinimum && rangeValid;
  const actions = <div className="quote-actions">
    {result.ok && result.belowMinimum && <p role="status">The smallest order is KES {number(settings.minOrderKes)}.</p>}
    <Button type="button" disabled={!canBook} onClick={() => openSheet("book")}>Book these plays</Button>
    <div className="quote-secondary"><Button variant="outline" type="button" disabled={!canBook} onClick={() => openSheet("book")}>Send to KCA</Button>
    <Button variant="outline" type="button" onClick={copyLink}>{copyState === "copied" ? "Link copied" : "Copy link"}</Button></div>
    <p role="status" className="copy-message">{copyState === "failed" ? "Copy failed. Select the address bar." : copyState === "copied" ? "The link is on your clipboard." : ""}</p>
  </div>;
  const card = result.ok ? <QuoteTotals result={result} settings={settings} weeks={weeks}>{actions}</QuoteTotals>
    : <div className="quote-card"><p className="quote-eyebrow">YOUR QUOTE</p><div role="status" className="quote-errors">{result.errors.map((e) => <p key={e}>{e}</p>)}</div><p>Choose days and times to see your price.</p></div>;

  return <section className="booking-canvas">
    <div className="booking-workspace">
      <div className="booking-layout">
        <ScreenPreview answers={answers} settings={settings} plays={result.ok ? result.plays : 0} />
        <div className="booking-controls">
          <Card className="length-tile"><fieldset><legend>Advert length <span>KES {settings.kesPerSecond} a second</span></legend><SegmentedChoice options={settings.lengths.map((length) => ({ value: length, label: length + "s" }))} value={answers.lengthSeconds} onChange={(lengthSeconds) => change({ lengthSeconds })} /></fieldset></Card>
          <Card className="frequency-tile"><fieldset><legend>Plays an hour <span>{settings.howOften.find((option) => option.plays === answers.howOften)?.label}</span></legend><SegmentedChoice options={settings.howOften.map((option) => ({ value: option.plays, label: String(option.plays), description: option.label }))} value={answers.howOften} onChange={(howOften) => change({ howOften })} /></fieldset></Card>
          <Card className="date-control"><span id="dates-label">Dates</span><button type="button" className="date-range-button" aria-labelledby="dates-label dates-value" aria-haspopup="dialog" onClick={() => openSheet("dates")}>
            <span id="dates-value">{dateLabel(from)} to {dateLabel(to)} / {Number.isInteger(weeks) ? weeks : number(weeks)} weeks</span><span aria-hidden="true">↗</span></button>
            <button type="button" className="budget-link" onClick={() => openSheet("budget")}>Start from a budget</button>
          </Card>
        </div>
        <div className="booking-grid-panel timetable-panel">
          <div className="timetable-heading"><div><h1>Pick your hours</h1><p>Your advert plays at every chosen time on every chosen day.</p></div><TimetableLegend /></div>
          <Timetable settings={settings} occupancy={occupancy} pending={!availabilityKnown} selection={answers} onSelect={(action) => change(toggleSelection(answers, action))} />
          <p className="timetable-note">You choose days and times; your advert plays at every chosen time on every chosen day.</p>
          <div className="availability-message" role="status">
            {!rangeValid ? "Choose dates in order, up to 366 days apart." : !availabilityCurrent ? "Updating busy hours..." : availability.error}
            {availabilityCurrent && availability.error && <button type="button" className="quiet-button" onClick={() => setRetry((n) => n + 1)}>Try again</button>}
          </div>
        </div>
        <aside className="quote-desktop" aria-label="Your quote">{card}</aside>
      </div>
    </div>
    <div className="quote-dock">
      <button type="button" className="dock-price" aria-haspopup="dialog" onClick={() => openSheet("quote")}>
        <small>Your quote <span aria-hidden="true">↑</span><span className="sr-only">, open details</span></small><strong key={result.ok ? result.priceKes : "empty"} className="dock-amount" aria-live="polite">{result.ok ? `KES ${number(result.priceKes)}` : "Choose hours"}</strong>
      </button>
      <button type="button" className="timetable-button" disabled={!canBook} onClick={() => openSheet("book")}>Book these plays</button>
    </div>
    <Sheet title={{ dates: "Choose dates", budget: "Start from a budget", quote: "Your quote", book: "Book these plays" }[sheet]} open={sheetOpen} onClose={() => setSheetOpen(false)}>
      {sheet === "dates" && <div className="staff-form space-y-5"><p>Earliest start: {dateLabel(earliest)}.</p>
        <label>From<input type="date" value={from} min={earliest} onChange={(event) => {
          if (!isValidDate(event.target.value)) return;
          const startDate = event.target.value < earliest ? earliest : event.target.value;
          change({ startDate, endDate: to < startDate ? addDays(startDate, 27) : to });
        }} /></label>
        <label>To<input type="date" value={to} min={from} max={addDays(from, 365)} onChange={(event) => { if (isValidDate(event.target.value)) change({ endDate: event.target.value }); }} /></label>
        <div className="date-presets">{[1, 2, 4, 8, 12].map((w) => <button type="button" key={w} className="quiet-button" onClick={() => change({ endDate: addDays(from, w * 7 - 1) })}>{w} {w === 1 ? "week" : "weeks"}</button>)}</div>
        {!rangeValid && <p role="alert">Choose dates in order, up to 366 days apart.</p>}
        <button type="button" className="timetable-button" disabled={!rangeValid} onClick={() => setSheetOpen(false)}>Use these dates</button>
      </div>}
      {sheet === "budget" && <form onSubmit={applyBudget} className="staff-form space-y-5"><p>We will fill the four answers for you. You can change them after.</p>
        <label>Budget in KES<input type="number" inputMode="numeric" min={settings.minOrderKes} step={1000} value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="10000" required /></label>
        <button type="submit" className="timetable-button">Use this budget</button><p role="status" key={budgetMessage} className="animate-quote-in">{budgetMessage}</p>
      </form>}
      {sheet === "quote" && card}
      {sheet === "book" && result.ok && !result.belowMinimum && <BookingForm key={query} request={answers} priceKes={result.priceKes} />}
    </Sheet>
  </section>;
}
