import { bookedHours, cellKey, requestCells, weekdayOf, type BookingRequest } from "@/lib/booking/hours";
import type { BlockId, BookingSettings } from "@/lib/booking/settings";
import { BLOCK_ORDER, DAY_ORDER, type Selection } from "@/lib/booking/selection";
import type { QuoteSuccess } from "@/lib/booking/quote";
import { number } from "./QuoteTotals";

export type { AdvertStep } from "./NextSteps";
import type { AdvertStep } from "./NextSteps";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The week at a glance: one tile per day, five bars from Morning to Late, lit where the advert plays. */
export function WeekStrip({ selection, labels }: { selection: Selection; labels: Record<BlockId, { label: string }> }) {
  const cells = new Set(requestCells(selection));
  return <div className="week-strip">
    <ol aria-label="When it plays">{DAY_ORDER.map((day, index) => {
      const lit = BLOCK_ORDER.filter((block) => cells.has(cellKey(day, block)));
      const said = lit.length ? lit.map((block) => labels[block].label).join(", ") : "no plays";
      return <li key={day} data-off={lit.length === 0} data-weekend={day === 0 || day === 6} title={`${DAY_NAMES[day]}: ${said}`}>
        <span className="sr-only">{DAY_NAMES[day]}: {said}</span>
        <b aria-hidden="true">{DAY_NAMES[day][0]}</b>
        <span className="week-bars" aria-hidden="true">{BLOCK_ORDER.map((block, b) =>
          <i key={block} data-on={cells.has(cellKey(day, block))} style={{ animationDelay: `${index * 30 + b * 20}ms` }} />)}</span>
      </li>;
    })}</ol>
  </div>;
}

/** "Play split bar" (saved 2026-11-05, not shown anywhere right now): weekday against weekend plays, as one bar. */
export function PlaySplit({ request, settings }: { request: BookingRequest; settings: BookingSettings }) {
  let weekday = 0;
  let weekend = 0;
  for (const key of bookedHours(request, settings)) { const day = weekdayOf(key.slice(0, 10)); if (day === 0 || day === 6) weekend += request.howOften; else weekday += request.howOften; }
  if (weekday + weekend === 0) return null;
  return <div className="quote-split-wrap">
    <div className="quote-split-bar" role="img" aria-label={`${number(weekday)} plays on weekdays, ${number(weekend)} on weekends`}>
      <i style={{ flexGrow: weekday }} /><i style={{ flexGrow: weekend }} />
    </div>
    <p className="quote-split-legend"><span>Weekdays: {number(weekday)} plays</span><span>Weekends: {number(weekend)} plays</span></p>
  </div>;
}

export default function QuoteDetails({ request, result, settings }: { request: BookingRequest; result: QuoteSuccess; settings: BookingSettings; advert?: AdvertStep }) {
  const saved = result.fullPriceKes - result.priceKes;
  return <div className="quote-details">
    <section className="quote-breakdown" aria-label="How the price is built">
      <dl>
        <div><dt>{number(result.plays)} plays x {request.lengthSeconds}s</dt><dd>{number(result.plays * request.lengthSeconds)} seconds</dd></div>
        <div><dt>KES {number(settings.kesPerSecond)} a second</dt><dd>KES {number(result.fullPriceKes)}</dd></div>
        <div><dt>Discount</dt><dd>{result.discountPercent ? `${result.discountPercent}%, minus KES ${number(saved)}` : "0%"}</dd></div>
        <div className="is-total"><dt>Total</dt><dd key={result.priceKes}>KES {number(result.priceKes)}</dd></div>
      </dl>
    </section>
  </div>;
}
