import { CheckCircle, Coins, Flag, Monitor, Receipt, ShieldCheck, XCircle } from "@phosphor-icons/react/dist/ssr";
import type { PublicBooking } from "@/lib/store/types";

const day = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: iso.length === 10 ? "UTC" : "Africa/Nairobi" });
const ORDER = ["Quote", "Paid", "Approved", "Live", "Finished"];

/** The whole booking as five stops: done stops are dated, the current one glows, later ones show when they are due. */
export default function BookingProgress({ booking }: { booking: Pick<PublicBooking, "status" | "createdAt" | "steps" | "request"> }) {
  if (booking.status === "Cancelled") return <div className="progress-track is-cancelled" role="status">
    <XCircle size={20} aria-hidden="true" /><span>This booking was cancelled{booking.steps.at(-1) ? ` on ${day(booking.steps.at(-1)!.at)}` : ""}.</span>
  </div>;
  const reached = ORDER.indexOf(booking.status);
  const at = (status: string) => booking.steps.filter((s) => s.status === status).at(-1)?.at;
  const stops = [
    { label: "Booked", Icon: Receipt, when: day(booking.createdAt) },
    { label: "Paid", Icon: Coins, when: at("Paid") ? day(at("Paid")!) : "next" },
    { label: "Approved", Icon: ShieldCheck, when: at("Approved") ? day(at("Approved")!) : "1 working day" },
    { label: "On screen", Icon: Monitor, when: day(at("Live") ?? booking.request.startDate) },
    { label: "Finished", Icon: Flag, when: day(booking.request.endDate) },
  ];
  // The current stop is the next one to happen; a finished booking has every stop done.
  const current = booking.status === "Finished" ? 5 : reached + 1;
  return <ol className="progress-track" aria-label="Booking progress" style={{ ["--progress" as string]: Math.min(current, 4) / 4 }}>
    {stops.map(({ label, Icon, when }, index) => {
      const state = index < current ? "done" : index === current ? "now" : "later";
      return <li key={label} data-state={state} style={{ animationDelay: `${index * 60}ms` }}>
        <span className="progress-dot">{state === "done" ? <CheckCircle size={18} weight="fill" aria-hidden="true" /> : <Icon size={17} weight={state === "now" ? "bold" : "regular"} aria-hidden="true" />}</span>
        <b>{label}</b><small>{when}</small>
        <span className="sr-only">{state === "done" ? ", done" : state === "now" ? ", happening next" : ", later"}</span>
      </li>;
    })}
  </ol>;
}
