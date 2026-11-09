export type BookingFacts = { reference: string; dates: string; plan: string; lines: string[]; payment: string };

// The booking summary shown under the checks, or alone when no file has been uploaded yet.
export default function AdvertBookingCard({ facts }: { facts: BookingFacts }) {
  return <section className="advert-booking" aria-label="Booking">
    <div className="advert-booking-head"><span>Booking</span><code>{facts.reference}</code></div>
    <dl>
      <div><dt>Dates</dt><dd>{facts.dates}</dd></div>
      <div><dt>Plan</dt><dd>{facts.plan}</dd></div>
      <div><dt>Blocks</dt><dd>{facts.lines.map((line) => <span key={line}>{line}</span>)}</dd></div>
      <div><dt>Payment</dt><dd>{facts.payment}</dd></div>
    </dl>
  </section>;
}
