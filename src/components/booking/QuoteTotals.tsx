import type { ReactNode } from "react";
import type { BookingSettings } from "@/lib/booking/settings";
import type { QuoteSuccess } from "@/lib/booking/quote";

export const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export function RollingPrice({ value }: { value: number }) {
  const amount = number(value);
  return <p className="quote-price" aria-label={`KES ${amount}`}><span className="quote-currency" aria-hidden="true">KES</span>{" "}
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
      <strong>{step.percent}%</strong><span className="ladder-track" data-next={step === next} aria-hidden="true">
        <span style={{ transform: `scaleX(${step === current ? progress : 0})` }} />
      </span><small>{step === current ? `you: ${number(plays)}` : `${number(step.minPlays)}+`}</small>
    </li>)}</ol>
    <p>{next ? `${number(next.minPlays - plays)} more plays reaches ${next.percent}% off.` : "You have reached the highest discount."}</p>
  </div>;
}
export default function QuoteTotals({ result, settings, children }: { result: QuoteSuccess; settings: BookingSettings; children?: ReactNode }) {
  return <div className="quote-card">
    <p className="quote-eyebrow">YOUR QUOTE</p>
    <div aria-live="polite" aria-atomic="true"><RollingPrice value={result.priceKes} /></div>
    <p className="quote-metrics">{number(result.plays)} plays / KES {number(result.perPlayKes)} each / {number(result.hoursBooked)} screen hours</p>
    <DiscountLadder plays={result.plays} settings={settings} />
    {children}
    <p className="quote-footnote">Prices include VAT. KCA confirms space before you pay.</p>
  </div>;
}
