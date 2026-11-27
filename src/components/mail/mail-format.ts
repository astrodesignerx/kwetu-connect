import type { ParsedMessage } from "@/lib/mail/client";

export function replyRecipients(kind: "reply" | "replyAll" | "forward", message: Pick<ParsedMessage, "from" | "replyTo" | "to" | "cc">, mailbox: string) {
  if (kind === "forward") return { to: "", cc: "" };
  const own = mailbox.trim().toLowerCase();
  const outgoing = message.from.some((a) => a.address.toLowerCase() === own);
  const recipients = outgoing ? message.to : message.replyTo?.length ? message.replyTo : message.from;
  const used = new Set<string>();
  function unique(list: typeof message.to) {
    return list.map((a) => a.address.trim()).filter((address) => {
      const key = address.toLowerCase();
      if (!key || used.has(key)) return false;
      used.add(key);
      return true;
    }).join(", ");
  }
  const to = unique(recipients);
  used.add(own);
  return { to, cc: kind === "replyAll" ? unique([...message.to, ...message.cc]) : "" };
}

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

/**
 * What someone typed, as simple email HTML: a paragraph per blank line and a line break per new line, plus the
 * formatting the compose toolbar writes: **bold**, *italic*, [text](https://link), bare links, "- " and "1. " lists.
 * Everything is escaped first, so typed HTML stays text.
 */
export function textToHtml(text: string): string {
  return text.trim().split(/\n{2,}/).map(formatBlock).join("");
}
const BULLET = /^\s*[-*\u2022]\s+(?=\S)/, NUMBERED = /^\s*\d{1,3}[.)]\s+(?=\S)/;
function formatBlock(block: string): string {
  const out: string[] = [];
  let lines: string[] = [], list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const endLines = () => { if (lines.length) out.push(`<p>${lines.map(formatInline).join("<br>")}</p>`); lines = []; };
  const endList = () => { if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${formatInline(item)}</li>`).join("")}</${list.tag}>`); list = null; };
  for (const line of block.split("\n")) {
    const tag = BULLET.test(line) ? "ul" : NUMBERED.test(line) ? "ol" : null;
    if (!tag) { endList(); lines.push(line); continue; }
    endLines();
    if (list && list.tag !== tag) endList();
    if (!list) list = { tag, items: [] };
    list.items.push(line.replace(tag === "ul" ? BULLET : NUMBERED, ""));
  }
  endLines(); endList();
  return out.join("");
}
function formatInline(line: string): string {
  // Links are set aside first, so an underscore or star inside an address is never read as formatting.
  const kept: string[] = [];
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;
  return escapeHtml(line)
    .replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/gi, (_, label: string, url: string) => keep(`<a href="${url}">${label}</a>`))
    .replace(/\bhttps?:\/\/[^\s<\u0000]*[^\s<\u0000.,;:!?)\]'"]/gi, (url) => keep(`<a href="${url}">${url}</a>`))
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]);
}
/** A mailbox signature under the message, above any quoted email. */
export const signatureHtml = (signature: string) => signature.trim() ? `<div class="kca-signature" style="margin-top:18px">${textToHtml(signature)}</div>` : "";

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

/* Snooze and follow-up times, always in Nairobi time (UTC+3, no daylight saving). */
const NAIROBI = 3 * 3_600_000;
function nairobiAt(now: Date, days: number, hour: number) {
  const n = new Date(now.getTime() + NAIROBI);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + days, hour) - NAIROBI);
}
/** "Fri 08:00" */
export const shortWhen = (iso: string | Date) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof iso === "string" ? new Date(iso) : iso);
export function snoozeChoices(now = new Date()): { label: string; at: Date }[] {
  const n = new Date(now.getTime() + NAIROBI), hour = n.getUTCHours(), weekday = n.getUTCDay();
  const later = new Date(now.getTime() + 3 * 3_600_000);
  return [
    ...(hour < 18 ? [{ label: "Later today", at: later }] : []),
    { label: "Tomorrow morning", at: nairobiAt(now, 1, 8) },
    ...(weekday >= 1 && weekday <= 3 ? [{ label: "Friday morning", at: nairobiAt(now, 5 - weekday, 8) }] : []),
    { label: "Next week", at: nairobiAt(now, ((8 - weekday) % 7) || 7, 8) },
  ];
}
export const REMIND_DAYS = [[1, "Tomorrow"], [3, "In 3 days"], [7, "In a week"]] as const;

const AVATAR_TONES = ["amber", "blue", "violet", "sage", "rose", "ember"] as const;
export type AvatarTone = typeof AVATAR_TONES[number];
/** Deterministic soft monogram tint for a client or sender, matching the Booking Desk palette. */
export function avatarTone(seed: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

/** Semantic stage badge tone matching the Booking Desk palette: Quote=blue, Approved=violet, Paid=amber, Live=green. */
export const stageTone = (status: string) => ({ Quote: "stage-quote", Approved: "stage-approved", Paid: "stage-paid", Live: "stage-live", Cancelled: "stage-cancelled" }[status] ?? "stage-done");
export const stageLabel = (status: string) => status === "Live" ? "On air" : status;

/** Day number and short uppercase month for a calendar date tile ("1", "DEC"). */
export function dayTile(iso: string): { day: string; month: string } {
  const d = dateValue(iso);
  return {
    day: new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric" }).format(d),
    month: new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, month: "short" }).format(d).toUpperCase(),
  };
}
