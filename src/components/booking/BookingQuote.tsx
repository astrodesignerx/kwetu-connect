"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addDays, earliestStartDate } from "@/lib/booking/hours";
import { readAnswers, buildQuery, normaliseDays, normaliseBlocks, type Answers } from "@/lib/booking/answers";
import { occupancyByDayBlock, type Occupancy } from "@/lib/booking/occupancy";
import { fromCells, openSelection, scheduleLines, toggleSelection } from "@/lib/booking/selection";
import { suggestPlan } from "@/lib/booking/plan";
import { quote } from "@/lib/booking/quote";
import type { BookingSettings } from "@/lib/booking/settings";
import Timetable, { TimetableLegend } from "./Timetable";
import QuoteTotals, { number, type PlanTile } from "./QuoteTotals";
import Sheet from "./Sheet";
import BookingForm, { ChangeForm } from "./BookingForm";
import AdvertUpload, { advertReady, type AdvertState } from "./AdvertUpload";
import SegmentedChoice from "./SegmentedChoice";
import DatesCalendar from "./DatesCalendar";
import QuoteDetails, { WeekStrip } from "./QuoteDetails";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkSimple, Minus, PaintBrush, PaperPlaneTilt, Plus, WhatsappLogo } from "@phosphor-icons/react";

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
/** The unpaid booking being changed, when /book opens with ?edit=REF. */
export type Editing = { reference: string; priceKes: number };
export default function BookingQuote({ initialAnswers, initialOccupancy, today, settings, editing = null }: {
  initialAnswers: Answers; initialOccupancy: Occupancy; today: string; settings: BookingSettings; editing?: Editing | null;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [advert, setAdvert] = useState<AdvertState | null>(null);
  const [sheet, setSheet] = useState<"quote" | "book">("quote");
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
  const weeksLabel = `${Number.isInteger(weeks) ? weeks : number(weeks)} ${weeks === 1 ? "week" : "weeks"}`;
  const oftenSteps = settings.howOften.map((option) => option.plays).sort((a, b) => a - b);
  const oftenIndex = oftenSteps.indexOf(answers.howOften);
  const oftenOption = settings.howOften.find((option) => option.plays === answers.howOften);
  function openSheet(value: typeof sheet) { setSheet(value); setSheetOpen(true); }

  useEffect(() => {
    const nextUrl = `${window.location.pathname}?${query}${editing ? "&edit=" + editing.reference : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState(null, "", nextUrl);
  }, [query, editing]);
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
    setAnswers({ ...suggested.request, ...fromCells(normaliseDays(suggested.request.days).flatMap((day) => normaliseBlocks(suggested.request.blocks).map((block) => `${day}-${block}`))) });
    setBudgetMessage(`We filled in ${number(suggested.quote.plays)} plays for KES ${number(suggested.quote.priceKes)}.`);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/book?${query}`); setCopyState("copied"); }
    catch { setCopyState("failed"); }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }
  const canBook = result.ok && !result.belowMinimum && rangeValid;
  const shortDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const picked = { ...answers, ...openSelection(answers, (day, block) => occupancy[day][block].open) };
  const schedule = scheduleLines(picked, settings.timeBlocks);
  const ready = advertReady(advert, answers.lengthSeconds);
  const advertState = !advert ? "none" : advert.running ? "checking" : ready ? "ready" : "fix";
  const tiles: PlanTile[] = [
    { icon: "length", value: answers.lengthSeconds + "s", note: "each play" },
    { icon: "often", value: (oftenOption?.label ?? "").replace(/ minutes$/, " min") || answers.howOften + " an hour", note: `${answers.howOften} an hour` },
    { icon: "dates", value: (answers.startDate.slice(0, 7) === answers.endDate.slice(0, 7) ? shortDate(answers.startDate).split(" ")[0] : shortDate(answers.startDate)) + " to " + shortDate(answers.endDate), note: weeksLabel },
    { icon: advertState === "ready" ? "advert-ok" : advertState === "fix" ? "advert-fix" : "advert", value: "Advert",
      note: { none: "not added yet", checking: "checking", ready: "checked", fix: "needs fixing" }[advertState], tone: advertState },
  ];
  const lead = schedule.length ? <WeekStrip selection={picked} labels={settings.timeBlocks} />
    : <p className="quote-schedule"><span>Pick boxes in the grid</span></p>;
  // Below the smallest order: show how far off it is, and one-tap changes that reach it.
  const shortBy = result.ok && result.belowMinimum ? settings.minOrderKes - result.priceKes : 0;
  const fixes: { label: string; change: Partial<Answers>; price: number }[] = [];
  if (shortBy > 0) {
    const reaches = (partial: Partial<Answers>) => { const q = quote({ ...answers, ...partial }, settings); return q.ok && !q.belowMinimum ? q.priceKes : 0; };
    const longer = [...settings.lengths].sort((x, y) => x - y).find((length) => length > answers.lengthSeconds && reaches({ lengthSeconds: length }));
    if (longer) fixes.push({ label: "Make it " + longer + "s", change: { lengthSeconds: longer }, price: reaches({ lengthSeconds: longer }) });
    const oftener = oftenSteps.find((plays) => plays > answers.howOften && reaches({ howOften: plays }));
    if (oftener) fixes.push({ label: oftener + " an hour", change: { howOften: oftener }, price: reaches({ howOften: oftener }) });
  }
  const gap = result.ok && result.belowMinimum ? <div className="quote-gap" role="status">
    <div className="quote-gap-row"><span>Smallest order KES {number(settings.minOrderKes)}</span><span><b>KES {number(shortBy)}</b> to go</span></div>
    <span className="quote-gap-track" aria-hidden="true"><i style={{ transform: "scaleX(" + Math.min(1, result.priceKes / settings.minOrderKes) + ")" }} /></span>
    {fixes.length > 0 && <div className="quote-fixes">{fixes.map((fix) => <button key={fix.label} type="button" onClick={() => change(fix.change)}>{fix.label} <b>KES {number(fix.price)}</b></button>)}</div>}
  </div> : null;
  const actions = <div className="quote-actions">
    <div className="quote-action-row">
      <Button type="button" disabled={!canBook} onClick={() => openSheet("book")}>{shortBy > 0 ? "Add KES " + number(shortBy) + " to book" : editing ? "Save changes" : "Book these plays"}</Button>
      <Button variant="outline" size="icon" type="button" disabled={!canBook} onClick={() => openSheet("book")} aria-label="Send to KCA" title="Send to KCA"><PaperPlaneTilt size={18} aria-hidden="true" /></Button>
      <Button variant="outline" size="icon" type="button" onClick={copyLink} aria-label={copyState === "copied" ? "Link copied" : "Copy link"} title="Copy link"><LinkSimple size={18} aria-hidden="true" /></Button>
    </div>
    <p role="status" className="copy-message">{copyState === "failed" ? "Copy failed. Select the address bar." : copyState === "copied" ? "The link is on your clipboard." : ""}</p>
  </div>;
  const card = result.ok ? <QuoteTotals result={result} settings={settings} weeks={weeks} tiles={tiles} eyebrow={editing ? <span className="quote-editing"><span>CHANGING {editing.reference.slice(0, 12)}</span><s>was KES {number(editing.priceKes)}</s></span> : undefined} lead={lead} gap={gap}><QuoteDetails request={answers} result={result} settings={settings} advert={advertState} />{actions}</QuoteTotals>
    : <div className="quote-card"><p className="quote-eyebrow">YOUR QUOTE</p><div role="status" className="quote-errors">{result.errors.map((e) => <p key={e}>{e}</p>)}</div><p>Choose days and times to see your price.</p></div>;

  return <section className="booking-canvas">
    <div className="booking-workspace">
      <div className="booking-layout">
        <AdvertUpload lengthSeconds={answers.lengthSeconds} advert={advert} onChange={setAdvert} />
        <div className="booking-controls">
          <Card className="advert-card">
            <div className="control-title"><h2>Your advert</h2><p>KES {settings.kesPerSecond} a second, every play.</p></div>
            <fieldset><legend>Length</legend><SegmentedChoice options={settings.lengths.map((length) => ({ value: length, label: length + "s" }))} value={answers.lengthSeconds} onChange={(lengthSeconds) => change({ lengthSeconds })} /></fieldset>
            <div className="plays-stepper" role="group" aria-labelledby="plays-label">
              <div><span id="plays-label">Plays an hour</span><p>{oftenOption?.label}</p></div>
              <button type="button" aria-label="Fewer plays an hour" disabled={oftenIndex <= 0} onClick={() => change({ howOften: oftenSteps[oftenIndex - 1] })}><Minus size={16} aria-hidden="true" /></button>
              <strong key={answers.howOften} aria-live="polite">{answers.howOften}</strong>
              <button type="button" aria-label="More plays an hour" disabled={oftenIndex >= oftenSteps.length - 1} onClick={() => change({ howOften: oftenSteps[oftenIndex + 1] })}><Plus size={16} aria-hidden="true" /></button>
            </div>
          </Card>
          <Card className="dates-card">
            <div className="control-title is-row"><h2>Dates</h2><span className="weeks-chip">{weeksLabel}</span></div>
            <DatesCalendar from={from} to={to} earliest={earliest} playDays={picked.days} onChange={change} />
            {!rangeValid && <p role="alert" className="control-error">Choose dates in order, up to 366 days apart.</p>}
          </Card>
          <Card className="budget-card">
            <form onSubmit={applyBudget}><h2 id="budget-label">Start from a budget</h2>
              <div className="budget-row"><label className="budget-input"><span>KES</span><input type="number" inputMode="numeric" min={settings.minOrderKes} step={1000} value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="10,000" aria-labelledby="budget-label" required /></label>
              <Button variant="outline" type="submit">Plan it</Button></div>
              <p role="status" key={budgetMessage} className="budget-message animate-quote-in">{budgetMessage}</p>
            </form>
          </Card>
          {!advert && <Card className="no-advert-card">
            <div className="no-advert-head"><span className="no-advert-icon" aria-hidden="true"><PaintBrush size={18} weight="bold" /></span><div><h2>No advert yet?</h2><p>We can design it for you, sized for the screen.</p></div></div>
            <a className="ui-button ui-button-outline no-advert-link" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi KCA, I don't have an advert yet. Can you design a ${answers.lengthSeconds} second advert for me?`)}`} target="_blank" rel="noopener noreferrer"><WhatsappLogo size={16} weight="fill" aria-hidden="true" />Ask KCA to make it</a>
          </Card>}
        </div>
        <div className="booking-grid-panel timetable-panel">
          <div className="timetable-heading"><div><h1>Pick your hours</h1><p>Your advert plays only in the boxes you pick, {answers.howOften} times an hour.</p></div><TimetableLegend /></div>
          <Timetable settings={settings} occupancy={occupancy} pending={!availabilityKnown} selection={answers} onSelect={(action) => change(toggleSelection(answers, action, (day, block) => occupancy[day][block].open))} />
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
      <button type="button" className="timetable-button" disabled={!canBook} onClick={() => openSheet("book")}>{editing ? "Save changes" : "Book these plays"}</button>
    </div>
    <Sheet variant={sheet === "book" ? "dialog" : "sheet"} title={{ quote: "Your quote", book: editing ? "Change your booking" : "Book these plays" }[sheet]} open={sheetOpen} onClose={() => setSheetOpen(false)}>
      {sheet === "quote" && card}
      {sheet === "book" && result.ok && !result.belowMinimum && <div className="book-dialog">
        <section className="book-recap" aria-label="Your booking">
          <div className="book-recap-price"><small>Total</small><strong>KES {number(result.priceKes)}</strong><span>{number(result.plays)} plays over {Number.isInteger(weeks) ? weeks : number(weeks)} weeks{result.discountPercent ? `, ${result.discountPercent}% off` : ""}</span></div>
          <Timetable settings={settings} occupancy={occupancy} selection={answers} />
          <dl className="quote-plan">{[["Dates", dateLabel(from) + " to " + dateLabel(to)], ["Each play", answers.lengthSeconds + "s, " + answers.howOften + " an hour"], ["Screen hours", number(result.hoursBooked)]].map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
          <div className={`book-recap-advert is-${!advert ? "none" : ready ? "ready" : "blocked"}`}>
            {advert && ready && (advert.file.type.startsWith("video/") ? <video src={advert.url} muted loop autoPlay playsInline aria-hidden="true" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={advert.url} alt="" />)}
            <p>{!advert ? "No advert yet. Add it in the photo box now, or send it to KCA later on WhatsApp."
              : ready ? <><strong>{advert.file.name}</strong> is checked and goes with this booking.</>
              : advert.running ? "Your advert is still being checked. Wait a moment to send it with this booking."
              : "Your advert did not pass the checks, so it will not be sent. Fix it, or send it to KCA later."}</p>
          </div>
        </section>
        {editing ? <ChangeForm key={query} reference={editing.reference} wasKes={editing.priceKes} request={picked} priceKes={result.priceKes} advert={ready ? advert!.file : null} advertSeconds={advert?.measured?.duration ? Math.round(advert.measured.duration) : answers.lengthSeconds} />
        : <BookingForm key={query} request={picked} priceKes={result.priceKes} advert={ready ? advert!.file : null} advertSeconds={advert?.measured?.duration ? Math.round(advert.measured.duration) : answers.lengthSeconds} />}
      </div>}
    </Sheet>
  </section>;
}
