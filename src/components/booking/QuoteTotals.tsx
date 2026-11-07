import type { ReactNode } from "react";
import type { BookingSettings } from "@/lib/booking/settings";
import type { QuoteSuccess } from "@/lib/booking/quote";

export const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export function RollingPrice({ value }: { value: number }) {
  const amount = number(value);
  // Screen readers read the hidden plain text; the rolling digits are visual only.
  return <p className="quote-price"><span className="sr-only">KES {amount}</span><span className="quote-currency" aria-hidden="true">KES</span>{" "}
    <span aria-hidden="true" className="price-digits">{[...amount].map((digit, index) =>
      <span className="digit-window" key={index}><span className="price-digit" key={digit}>{digit}</span></span>)}</span>
  </p>;
}
export function DiscountLadder({ plays, settings }: { plays: number; settings: BookingSettings }) {
  const steps = [...settings.discountSteps, { minPlays: 0, percent: 0 }].sort((a, b) => b.minPlays - a.minPlays);
  const current = steps.find((s) => plays >= s.minPlays)!;
  const next = [...steps].reverse().find((s) => s.minPlays > plays);
  const progress = next ? (plays - current.minPlays) / (next.minPlays - current.minPlays) : 1;
  return <div className="discount-ladder">
    <h2>Discount ladder</h2>
    <ol>{steps.map((step) => <li key={step.minPlays} data-current={step === current}>
      <strong>{step.percent}%</strong><span className="ladder-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${step === current ? progress : 0})` }} />
      </span><small>{step === current ? `you: ${number(plays)}` : `${number(step.minPlays)}+`}</small>
    </li>)}</ol>
  </div>;
}
function DiscountRing({ plays, settings }: { plays: number; settings: BookingSettings }) {
  const steps = [...settings.discountSteps, { minPlays: 0, percent: 0 }].sort((a, b) => a.minPlays - b.minPlays);
  const current = steps.filter((step) => step.minPlays <= plays).at(-1)!;
  const next = steps.find((step) => step.minPlays > plays);
  const progress = next ? Math.max(0, Math.min(1, (plays - current.minPlays) / (next.minPlays - current.minPlays))) : 1;
  return <div className="v2-discount-ring" role="img" aria-label={next ? `${number(next.minPlays - plays)} more plays for ${next.percent}% off` : "Highest discount reached"}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff14" strokeWidth="7" /><circle cx="50" cy="50" r="42" fill="none" stroke="#ff8a3d" strokeWidth="7" pathLength="100" strokeDasharray={`${progress * 100} 100`} strokeLinecap="round" /></svg><div><b key={plays}>{number(plays)}</b><small>plays</small></div><p>{next ? <><b>{number(next.minPlays - plays)}</b> more for {next.percent}% off</> : `${current.percent}% off, highest tier`}</p></div>;
}
export type PlanTile = { icon: keyof typeof tileIcons; value: string; note: string; tone?: string };
// Line icons for the plan tiles; drawn with currentColor so the tile tone sets their colour.
const tileIcons = {
  length: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>,
  often: <><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  dates: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  advert: <><rect x="2.5" y="5" width="19" height="12" rx="2" /><path d="M8 21h8M12 14V8M9 11l3-3 3 3" /></>,
  "advert-ok": <><rect x="2.5" y="5" width="19" height="12" rx="2" /><path d="M8 21h8M8.5 11l2.5 2.5 4.5-4.5" /></>,
  "advert-fix": <><rect x="2.5" y="5" width="19" height="12" rx="2" /><path d="M8 21h8M12 8v3.5M12 14h.01" /></>,
};
/** Quote card, concept B "Split" (2026-11-05): price and plays side by side, plan as chips, compact ladder. */
export default function QuoteTotals({ result, settings, weeks, chips, tiles, eyebrow, lead, gap, children, v2 = false }: {
  result: QuoteSuccess; settings: BookingSettings; weeks: number; chips?: string[]; tiles?: PlanTile[]; eyebrow?: ReactNode; lead?: ReactNode; gap?: ReactNode; children?: ReactNode; v2?: boolean;
}) {
  const tags = chips ?? [`${number(weeks)} ${weeks === 1 ? "week" : "weeks"}`];
  return <div className={`quote-card quote-split${result.belowMinimum ? " is-below" : ""}${v2 ? " v2-quote" : ""}`}>
    <p className="quote-eyebrow">{eyebrow ?? "YOUR QUOTE"}{v2 && <span>VAT included</span>}</p>
    <div className="quote-top">
      <div aria-live="polite" aria-atomic="true"><RollingPrice value={result.priceKes} /></div>
      {v2 ? <DiscountRing plays={result.plays} settings={settings} /> : <p className="quote-plays"><strong key={result.plays} className="rolling-number">{number(result.plays)}</strong><small>plays</small></p>}
    </div>
    <p className="quote-metrics">KES {number(result.perPlayKes)} a play</p>
    {tiles ? <ul className="quote-tiles" aria-label="Your plan">{tiles.map((tile) => <li key={tile.icon} data-tone={tile.tone}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{tileIcons[tile.icon]}</svg>
      <strong key={tile.value}>{tile.value}</strong><small key={tile.note}>{tile.note}</small>
    </li>)}</ul>
      : <ul className="quote-chips" aria-label="Your plan">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}
    {lead}
    {/* Below the smallest order the shortfall panel takes the ladder's place; once it is met the ladder returns. */}
    {v2 ? <><DiscountLadder plays={result.plays} settings={settings} />{gap}</> : gap ?? <DiscountLadder plays={result.plays} settings={settings} />}
    {children}
  </div>;
}
