import type { BookingStatus } from "./capacity";
import type { BookingListItem, BookingStore } from "@/lib/store/types";
import { addDays, isValidDate, weekdayOf } from "./hours";
import { STATUSES } from "./status";
import { dayDate } from "@/lib/format/dates";

export type PipelineCard = BookingListItem & { waiting: number; approved: number; advertCount: number };
export type PipelineView = "needs" | "week" | "ending";
export type PipelineFilters = { status?: BookingStatus; from: string; to: string; q: string; view?: PipelineView; hide: boolean; layout: "board" | "list" };
export type Tone = "amber" | "rose" | "green" | "quiet";

/** Every booking with the advert counts the board needs. */
export async function loadCards(store: BookingStore): Promise<PipelineCard[]> {
  const list = await store.listBookings();
  const details = await Promise.all(list.map((booking) => store.bookingDetail(booking.reference)));
  return list.map((booking, index) => ({
    ...booking,
    advertCount: details[index]?.adverts.length ?? 0,
    waiting: details[index]?.adverts.filter((ad) => ad.decision === "waiting").length ?? 0,
    approved: details[index]?.adverts.filter((ad) => ad.decision === "approved").length ?? 0,
  }));
}

export function parseFilters(read: (key: string) => string): PipelineFilters {
  const view = read("view");
  return {
    status: STATUSES.find((status) => status === read("status")),
    from: isValidDate(read("from")) ? read("from") : "",
    to: isValidDate(read("to")) ? read("to") : "",
    q: read("q").slice(0, 150),
    view: view === "needs" || view === "week" || view === "ending" ? view : undefined,
    hide: read("hide") === "finished",
    layout: read("layout") === "list" ? "list" : "board",
  };
}

/** Search text and dates only. The quick chips count from this set. */
export function matchesBase(booking: PipelineCard, filter: Pick<PipelineFilters, "from" | "to" | "q">) {
  const query = filter.q.toLowerCase();
  return (!filter.from || booking.request.endDate >= filter.from) && (!filter.to || booking.request.startDate <= filter.to)
    && (!query || booking.reference.toLowerCase().includes(query) || booking.business.toLowerCase().includes(query) || booking.paymentNote.toLowerCase().includes(query));
}

export const needsAction = (booking: PipelineCard) =>
  (booking.status === "Quote" && !!booking.paymentNote) || (booking.status === "Paid" && (booking.waiting > 0 || booking.advertCount === 0));

export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export const startsThisWeek = (booking: PipelineCard, today: string) =>
  booking.status !== "Cancelled" && booking.request.startDate >= mondayOf(today) && booking.request.startDate <= addDays(mondayOf(today), 6);

export const endsThisMonth = (booking: PipelineCard, today: string) =>
  booking.status !== "Cancelled" && booking.request.endDate.slice(0, 7) === today.slice(0, 7);

export function matchesView(booking: PipelineCard, view: PipelineView | undefined, today: string) {
  if (!view) return true;
  return view === "needs" ? needsAction(booking) : view === "week" ? startsThisWeek(booking, today) : endsThisMonth(booking, today);
}

/** The bookings a page or export shows for these filters. */
export function visibleBookings(cards: PipelineCard[], filter: PipelineFilters, today: string) {
  return cards.filter((booking) => matchesBase(booking, filter) && (!filter.status || booking.status === filter.status) && matchesView(booking, filter.view, today)
    && !(filter.hide && (booking.status === "Finished" || booking.status === "Cancelled")));
}

/** Short label and tone for the one thing a booking is waiting on. */
export function nextTask(booking: PipelineCard, today: string): { label: string; tone: Tone } {
  if (booking.status === "Quote") return booking.paymentNote ? { label: "Check payment", tone: "amber" } : { label: "Awaiting payment", tone: "quiet" };
  if (booking.waiting) return { label: `${booking.waiting} advert${booking.waiting === 1 ? "" : "s"} to review`, tone: "amber" };
  if (booking.status === "Paid") return !booking.advertCount ? { label: "Advert missing", tone: "rose" } : booking.approved ? { label: "Ready to approve", tone: "green" } : { label: "Advert needs changes", tone: "rose" };
  if (booking.status === "Approved") return booking.request.startDate > today ? { label: "Starts " + dayDate(booking.request.startDate), tone: "green" } : { label: "Ready to go live", tone: "green" };
  if (booking.status === "Live") return booking.request.endDate < today ? { label: "Ready to finish", tone: "amber" } : { label: "Scheduled", tone: "green" };
  return { label: booking.status === "Finished" ? "Completed" : "Cancelled", tone: "quiet" };
}

/** The round avatar colour for a business, the same on booking cards and the Overview. */
export const avatarColour = (business: string) => ["#a3e635", "#2dd4bf", "#fb923c", "#60a5fa", "#fb7185"][business.charCodeAt(0) % 5];

const dayNumber = (date: string) => Math.round(Date.parse(date + "T00:00:00Z") / 86400000);
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** "Day 13 of 56" for a running booking, counted from the start date to today in Nairobi. */
export function liveProgress(booking: Pick<PipelineCard, "request">, today: string) {
  const total = daysBetween(booking.request.startDate, booking.request.endDate) + 1;
  const day = Math.min(total, Math.max(1, daysBetween(booking.request.startDate, today) + 1));
  return { day, total, ratio: total > 0 ? day / total : 0 };
}

export const weeksOf = (request: { startDate: string; endDate: string }) => Math.max(1, Math.ceil((daysBetween(request.startDate, request.endDate) + 1) / 7));

export type NextAction =
  | { kind: "move"; to: BookingStatus; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "payment"; label: string }
  | { kind: "contact"; label: string };

/** The one main button for the pop-up header. Null when nothing is due. */
export function nextAction(booking: { reference: string; status: BookingStatus; paymentNote: string; request: { endDate: string } }, adverts: { decision: string }[], today: string): NextAction | null {
  if (booking.status === "Quote") return booking.paymentNote.trim() ? { kind: "move", to: "Paid", label: "Mark as paid" } : { kind: "payment", label: "Mark as paid" };
  if (booking.status === "Paid") {
    if (adverts.some((ad) => ad.decision === "waiting")) return { kind: "link", href: "/manage/adverts?q=" + encodeURIComponent(booking.reference), label: "Review the advert" };
    if (adverts.some((ad) => ad.decision === "approved")) return { kind: "move", to: "Approved", label: "Approve booking" };
    return { kind: "contact", label: "Remind about the advert" };
  }
  if (booking.status === "Approved") return { kind: "move", to: "Live", label: "Move to Live" };
  if (booking.status === "Live" && today > booking.request.endDate) return { kind: "move", to: "Finished", label: "Mark finished" };
  return null;
}

/** "2026-11" for a month that from and to cover exactly, otherwise null. */
export function activeMonth(from: string, to: string) {
  if (!from || !to || from.slice(0, 7) !== to.slice(0, 7)) return null;
  const month = monthBounds(from.slice(0, 7));
  return month.from === from && month.to === to ? from.slice(0, 7) : null;
}

export function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, by: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

/** "Nov 2026" */
export const monthLabel = (month: string) => new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).replace("Sept", "Sep");
