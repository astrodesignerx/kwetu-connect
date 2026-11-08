import { bookedHours, type BookingRequest } from "@/lib/booking/hours";
import type { BookingSettings } from "@/lib/booking/settings";
import { CheckIcon } from "./AdvertUpload";

export type AdvertStep = "none" | "checking" | "ready" | "fix";

const when = (key: string) => {
  const date = new Date(key.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return { date, hour: key.slice(11, 13) + ":00" };
};

/**
 * "Next steps strip" (saved 2026-11-05, not shown anywhere right now).
 * Four steps left to right: book, pay, advert check, first play. Taken out of the quote card;
 * to bring it back, render <NextSteps request={answers} settings={settings} advert={...} /> inside QuoteDetails.
 * Styles: .check-list and .quote-next in src/app/globals.css.
 */
export default function NextSteps({ request, settings, advert = "none" }: { request: BookingRequest; settings: BookingSettings; advert?: AdvertStep }) {
  const hours = bookedHours(request, settings).sort();
  const first = hours.length ? when(hours[0]) : null;
  const last = hours.length ? when(hours[hours.length - 1]) : null;
  return <ol className="check-list quote-next" aria-label="What happens next">
    <li data-state="running"><CheckIcon state="running" /><div><span>Book these plays</span><small>Your details, then the booking is saved</small></div></li>
    <li data-state="pending"><CheckIcon state="pending" /><div><span>{"Pay by M‑Pesa or card"}</span><small>KCA confirms within 1 working day</small></div></li>
    <li data-state={advert === "ready" ? "pass" : advert === "fix" ? "warn" : advert === "checking" ? "running" : "pending"}>
      <CheckIcon state={advert === "ready" ? "pass" : advert === "fix" ? "warn" : advert === "checking" ? "running" : "pending"} />
      <div><span>{advert === "ready" ? "Advert passed the screen checks" : "KCA checks your advert"}</span><small key={advert}>{advert === "ready" ? "It goes with your booking" : advert === "fix" ? "Fix it above, or send it later" : advert === "checking" ? "Checking it now" : "Upload it now, or send it later"}</small></div>
    </li>
    {first && last && <li data-state="pending"><CheckIcon state="pending" /><div><span key={first.date + first.hour}>First play {first.date}, {first.hour}</span><small>Last play {last.date}</small></div></li>}
  </ol>;
}

/**
 * "What happens next" card (2026-11-07): takes the "No advert yet?" card's slot once an advert is added,
 * so the controls column keeps its shape. Advert first, then book and pay, KCA's check and the first play.
 * Styles: .next-card in src/app/globals.css.
 */
export function NextStepsCard({ request, settings, advert }: { request: BookingRequest; settings: BookingSettings; advert: Exclude<AdvertStep, "none"> }) {
  const hours = bookedHours(request, settings).sort();
  const first = hours.length ? when(hours[0]) : null;
  const advertIcon = advert === "ready" ? "pass" : advert === "fix" ? "warn" : "running";
  return <div className="next-card-body">
    <h2>What happens next</h2>
    <ol className="check-list next-card-steps">
      <li data-state={advertIcon}><CheckIcon state={advertIcon} /><div>
        <span key={advert}>{advert === "ready" ? "Advert added" : advert === "fix" ? "Advert needs a fix" : "Checking advert"}</span>
        <small key={advert + "-note"}>{advert === "ready" ? "Passed the checks" : advert === "fix" ? "Fix it, or send it later" : "One moment"}</small>
      </div></li>
      <li data-state="current"><span className="check-icon is-current" aria-hidden="true" /><div><span>Book and pay</span><small>{"M‑Pesa or card"}</small></div></li>
      <li data-state="pending"><CheckIcon state="pending" /><div><span>KCA checks it</span><small>In 1 working day</small></div></li>
      {first && <li data-state="pending"><CheckIcon state="pending" /><div><span>First play</span><small key={first.date + first.hour}>{first.date}, {first.hour}</small></div></li>}
    </ol>
  </div>;
}
