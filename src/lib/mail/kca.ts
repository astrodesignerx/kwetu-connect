import { bookingDates } from "@/components/mail/mail-format";
import type { Advertiser, Booking, MailDirectory } from "@/lib/store/types";
import { addDays, bookedHours, type BookingRequest } from "@/lib/booking/hours";
import { quote } from "@/lib/booking/quote";
import { buildQuery } from "@/lib/booking/answers";
import type { BookingSettings } from "@/lib/booking/settings";

export const emailKey = (email: string) => email.trim().toLowerCase();
// Match the conversation grouping used by the mailbox reader, including across folders.
export const threadKey = (subject: string) => subject.replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim().toLowerCase().slice(0, 200) || "(no subject)";
export type Client = { id: string; advertiser: Advertiser; emails: string[]; bookings: Booking[] };
export type MatchInput = { subject: string; text?: string; html?: string | null; addresses: string[] };
export type Match = { client: Client | null; booking: Booking | null; by: "reference" | "email" | null; unknownReference?: string };

export function clientsFrom(data: MailDirectory): Client[] {
  const groups = new Map<string, Client>();
  for (const a of [...data.advertisers].sort((a,b) => b.createdAt.localeCompare(a.createdAt))) {
    // Contact records are private to a booking. Only a shared email is a reliable identity.
    const id = emailKey(a.email) || a.id;
    let client = groups.get(id);
    if (!client) { client = { id, advertiser: a, emails: a.email ? [emailKey(a.email)] : [], bookings: [] }; groups.set(id, client); }
    client.bookings.push(...data.bookings.filter((b) => b.advertiserId === a.id));
  }
  for (const c of groups.values()) c.bookings.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  return [...groups.values()].sort((a,b) => a.advertiser.business.localeCompare(b.advertiser.business));
}

/** Build once per directory load, then reuse for every row and full conversation. */
export function matchIndex(data: MailDirectory) {
  const clients = clientsFrom(data);
  const byEmail = new Map(clients.flatMap((c) => c.emails.map((email) => [email, c] as const)));
  const byRef = new Map(clients.flatMap((c) => c.bookings.map((b) => [b.reference.toUpperCase(), { client: c, booking: b }] as const)));
  return (input: MatchInput): Match => {
    const refs = [...`${input.subject}\n${input.text ?? ""}\n${(input.html ?? "").replace(/<[^>]*>/g, " ")}`.matchAll(/\bKCA-[A-Z0-9]+\b/gi)].map((m) => m[0].toUpperCase());
    for (const ref of refs) { const hit = byRef.get(ref); if (hit) return { ...hit, by: "reference" }; }
    // An explicit unknown reference must not silently select an unrelated booking by email.
    if (refs.length) return { client: null, booking: null, by: null, unknownReference: refs[0] };
    for (const email of input.addresses) {
      const client = byEmail.get(emailKey(email));
      if (client) return { client, booking: client.bookings.find((b) => !["Finished", "Cancelled"].includes(b.status)) ?? client.bookings[0] ?? null, by: "email" };
    }
    return { client: null, booking: null, by: null };
  };
}

export function advertState(data: MailDirectory, booking: Booking) {
  const ads = data.adverts.filter((a) => a.bookingId === booking.id);
  return ads.some((a) => a.decision === "approved") ? "approved" : ads.some((a) => a.decision === "waiting") ? "waiting" : ads.some((a) => a.decision === "refused") ? "refused" : "none";
}
export const bookingHref = (b: Booking) => "/manage/bookings/" + encodeURIComponent(b.reference);
export function managerAction(data: MailDirectory, b: Booking) {
  if (b.status === "Quote") return { label: "Confirm payment", href: bookingHref(b) };
  if (data.adverts.some((a) => a.bookingId === b.id && a.decision === "waiting")) return { label: "Review advert on the Advert desk", href: "/manage/adverts?q=" + encodeURIComponent(b.reference) };
  return { label: "Open booking", href: bookingHref(b) };
}
export function managerBrief(data: MailDirectory, today: string) {
  const open = data.bookings.filter((b) => !["Finished", "Cancelled"].includes(b.status));
  const ordered = (bs: Booking[]) => bs.sort((a,b) => a.request.startDate.localeCompare(b.request.startDate));
  return {
    review: ordered(open.filter((b) => data.adverts.some((a) => a.bookingId === b.id && a.decision === "waiting"))),
    payment: ordered(open.filter((b) => b.status === "Quote")),
    live: ordered(open.filter((b) => b.status === "Live" && bookedHours({ ...b.request, startDate: today, endDate: today }, data.settings).length > 0 && b.request.startDate <= today && b.request.endDate >= today)),
    next: ordered(open.filter((b) => b.request.startDate > today && b.request.startDate <= addDays(today, 7))),
  };
}
export function quickQuote(request: BookingRequest, settings: BookingSettings) {
  const result = quote(request, settings);
  const href = "/book?" + buildQuery(request);
  return { result, href, reply: result.ok ? `For ${request.lengthSeconds} second plays from ${bookingDates(request.startDate,request.endDate)}, your plan gives ${result.plays.toLocaleString("en-GB")} plays for KES ${result.priceKes.toLocaleString("en-GB")}. ${result.belowMinimum ? `This is below the minimum order of KES ${settings.minOrderKes.toLocaleString("en-GB")}. Please extend the plan.` : "Subject to availability and booking confirmation."}\nView the plan: https://kwetuconnectads.co.ke${href}` : "" };
}
