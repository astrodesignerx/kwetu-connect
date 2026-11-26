import { bookingDates } from "@/components/mail/mail-format";
import type { Advertiser, Booking, MailDirectory } from "@/lib/store/types";
import { addDays, bookedHours, type BookingRequest } from "@/lib/booking/hours";
import { quote } from "@/lib/booking/quote";
import { buildQuery } from "@/lib/booking/answers";
import type { BookingSettings } from "@/lib/booking/settings";

export const emailKey = (email: string) => email.trim().toLowerCase();
// Match the conversation grouping used by the mailbox reader, including across folders.
export const threadKey = (subject: string) => subject.replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim().toLowerCase().slice(0, 200) || "(no subject)";
type Addr = { address: string };
/** The other side of a conversation: the first address that is not the mailbox itself (sender, then recipients). */
export function partyOf(m: { from: Addr | Addr[]; to?: Addr[]; cc?: Addr[] }, mine: string | Iterable<string>): string {
  const own = new Set((typeof mine === "string" ? [mine] : [...mine]).map(emailKey));
  for (const a of [...(Array.isArray(m.from) ? m.from : [m.from]), ...(m.to ?? []), ...(m.cc ?? [])]) {
    const email = emailKey(a?.address ?? "");
    if (email && !own.has(email)) return email;
  }
  return "";
}
/**
 * One conversation is one subject with one other party, so two clients who both write "Invoice" stay apart.
 * Without a party (mail between our own mailboxes) the subject alone is the key, as it was before.
 */
export const conversationKey = (subject: string, party = "") => party ? `${threadKey(subject).slice(0, 140)} | ${emailKey(party).slice(0, 57)}` : threadKey(subject);
/** Workspace data for a conversation. Rows saved before conversations had a party use the subject alone. */
export function metaFor<T extends { thread_key: string }>(meta: T[], subject: string, party = ""): T | undefined {
  const key = conversationKey(subject, party), legacy = threadKey(subject);
  return meta.find((m) => m.thread_key === key) ?? meta.find((m) => m.thread_key === legacy);
}
type Linkable = { from: Addr[]; to: Addr[]; cc: Addr[]; messageId: string | null; inReplyTo: string | null; references: string[] };
/**
 * Which same-subject messages belong with the opened one: the same other party, or a direct reply link.
 * Two clients who both write "Invoice" are two conversations, so a reply cannot go to the wrong one.
 */
export function sameConversation<T extends Linkable>(opened: T, messages: T[], mailboxEmail: string): T[] {
  const party = partyOf(opened, mailboxEmail);
  const linked = (m: T) => (!!m.messageId && (opened.references.includes(m.messageId) || opened.inReplyTo === m.messageId))
    || (!!opened.messageId && (m.references.includes(opened.messageId) || m.inReplyTo === opened.messageId));
  return messages.filter((m) => m === opened || !party || partyOf(m, mailboxEmail) === party || linked(m));
}
export type ClientLink = { sender_email: string; client_id: string; linked_by: string | null; linked_at: string };
export type Client = { id: string; advertiser: Advertiser; emails: string[]; bookings: Booking[]; linked?: string[] };
export type MatchInput = { subject: string; text?: string; html?: string | null; addresses: string[] };
export type Match = { client: Client | null; booking: Booking | null; by: "reference" | "email" | null; unknownReference?: string };

export function clientsFrom(data: MailDirectory, links: ClientLink[] = []): Client[] {
  const groups = new Map<string, Client>();
  for (const a of [...data.advertisers].sort((a,b) => b.createdAt.localeCompare(a.createdAt))) {
    // Contact records are private to a booking. Only a shared email is a reliable identity.
    const id = emailKey(a.email) || a.id;
    let client = groups.get(id);
    if (!client) { client = { id, advertiser: a, emails: a.email ? [emailKey(a.email)] : [], bookings: [] }; groups.set(id, client); }
    client.bookings.push(...data.bookings.filter((b) => b.advertiserId === a.id));
  }
  for (const c of groups.values()) c.bookings.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  // Addresses linked by hand match the client too. The booking email stays first, so notes keep their key.
  for (const link of links) {
    const client = groups.get(link.client_id), email = emailKey(link.sender_email);
    if (client && email && !client.emails.includes(email)) { client.emails.push(email); (client.linked ??= []).push(email); }
  }
  return [...groups.values()].sort((a,b) => a.advertiser.business.localeCompare(b.advertiser.business));
}

/** Build once per directory load, then reuse for every row and full conversation. */
export function matchIndex(data: MailDirectory, links: ClientLink[] = []) {
  const clients = clientsFrom(data, links);
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
