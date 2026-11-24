/** Formatting for the Mail page. Every time is shown in Nairobi time, whatever the browser's zone. */
const ZONE = "Africa/Nairobi";
const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dateValue = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00+03:00" : value);
const daysBetween = (a: Date, b: Date) => Math.round((Date.parse(day(a)) - Date.parse(day(b))) / 86_400_000);

/** "18:23" today, "29 Jun" this year, "29 Jun 2025" before. */
export function listTime(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (day(d) === day(now)) return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const age = daysBetween(now, d);
  if (age === 1) return "Yesterday";
  if (age >= 2 && age <= 6) return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short" }).format(d);
  const sameYear = day(d).slice(0, 4) === day(now).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** "17 Nov 2026, 18:23" for the reader. */
export function fullTime(iso: string | null): string {
  if (!iso) return "";
  const d = dateValue(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return briefDate(iso) + ", " + new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
export function briefDate(iso: string | Date = new Date()) {
  const d = typeof iso === "string" ? dateValue(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d).replace(",", "");
}
export function bookingDates(start: string, end?: string, now = new Date()) {
  const a = dateValue(start), b = dateValue(end || start);
  const year = day(a).slice(0, 4), otherYear = day(b).slice(0, 4);
  const withYear = year !== day(now).slice(0, 4) || otherYear !== year;
  const format = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(d);
  return format(a) + (end && end !== start ? " to " + format(b) : "");
}
export const number = (value: number) => value.toLocaleString("en-GB");
export const money = (value: number) => "KES " + number(value);
export function checkedAgo(iso?: string | null, now = new Date()) {
  if (!iso) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "checked just now" : minutes < 60 ? `checked ${minutes} minute${minutes === 1 ? "" : "s"} ago` : `checked ${listTime(iso, now)}`;
}

/** Which heading a message sits under in the list. */
export function dayGroup(iso: string | null, now = new Date()): "Today" | "Yesterday" | "This week" | "Earlier" {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (day(d) === day(now)) return "Today";
  const age = daysBetween(now, d);
  if (age === 1) return "Yesterday";
  return age >= 2 && age <= 6 ? "This week" : "Earlier";
}

/**
 * How long a message has waited for an answer: "3h", "2d". Only for the inbox, only for mail nobody has
 * answered from this mailbox, and only within a fortnight, so old and automated mail does not pile up timers.
 */
export function waitingFor(iso: string | null, answered: boolean, from: string, now = new Date()): string | null {
  if (!iso || answered || /^(no-?reply|mailer-daemon|notifications?|postmaster)@/i.test(from)) return null;
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60 || minutes > 14 * 24 * 60) return null;
  return minutes < 24 * 60 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / (24 * 60))}d`;
}

export function initials(name: string, address: string): string {
  const words = (name || address.split("@")[0]).replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export const senderName = (a: { name: string; address: string }) => a.name.trim() || a.address;

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** What someone typed, as simple email HTML: a paragraph per blank line, a line break per new line. */
export function textToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** The earlier message under a reply or forward, quoted the usual way. */
export function quoteBlock(m: { from: { name: string; address: string }[]; date: string | null; html: string | null; text: string }): string {
  const who = m.from[0] ? escapeHtml(senderName(m.from[0])) : "Someone";
  const body = m.html ?? `<p>${escapeHtml(m.text).replace(/\n/g, "<br>")}</p>`;
  return `<p>On ${escapeHtml(fullTime(m.date))}, ${who} wrote:</p><blockquote type="cite">${body}</blockquote>`;
}

export const replySubject = (subject: string, kind: "reply" | "forward") => {
  const clean = subject.replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim();
  return `${kind === "reply" ? "Re" : "Fwd"}: ${clean || "(no subject)"}`;
};

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Splits "a@x.com, b@y.com; c@z.com" into addresses. */
export const splitAddresses = (value: string) => value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
