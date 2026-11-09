import Link from "next/link";
import { nextTask, type PipelineCard } from "@/lib/booking/pipeline";
import { number } from "@/components/booking/QuoteTotals";
import { dateRange } from "@/lib/format/dates";

// The list layout: the same bookings as the board, one row each. A row opens the same pop-up as a card.
export default function BookingList({ bookings, query, selected, today }: { bookings: PipelineCard[]; query: string; selected: string; today: string }) {
  const href = (reference: string) => { const params = new URLSearchParams(query); params.set("selected", reference); return "/manage/bookings?" + params; };
  if (!bookings.length) return null;
  return <div className="booking-list-wrap"><table className="booking-list-table">
    <caption className="sr-only">Bookings. Choose a business to open the booking.</caption>
    <thead><tr><th scope="col">Business</th><th scope="col">Stage</th><th scope="col">Dates</th><th scope="col" className="is-number">Plays</th><th scope="col" className="is-number">KES</th><th scope="col">Next step</th></tr></thead>
    <tbody>{bookings.map((booking) => {
      const task = nextTask(booking, today);
      return <tr key={booking.reference} data-selected={selected === booking.reference}>
        <th scope="row" className="booking-list-business"><Link className="booking-list-link" href={href(booking.reference)} scroll={false} aria-label={`${booking.business}, ${booking.status}. Open booking`}>{booking.business}</Link><small className="reference-link">{booking.reference}</small></th>
        <td data-label="Stage"><span className="pipeline-pill" data-stage={booking.status}>{booking.status}</span></td>
        <td data-label="Dates">{dateRange(booking.request.startDate, booking.request.endDate)}</td>
        <td data-label="Plays" className="is-number">{number(booking.plays)}</td>
        <td data-label="KES" className="is-number">{number(booking.priceKes)}</td>
        <td data-label="Next step"><span className="pipeline-pill" data-tone={task.tone}>{task.label}</span></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
