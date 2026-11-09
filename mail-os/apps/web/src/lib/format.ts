/**
 * Every date, time, duration and count the interface shows comes from here, so a
 * date reads the same on every screen. Times are shown in Nairobi time, where the
 * business and its screens are.
 */
const ZONE = "Africa/Nairobi";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS: Record<string, string> = { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" };

export type DateInput = string | number | Date;

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric",
  weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** A calendar date such as "2026-11-14" means that day, whatever the time zone. */
function toDate(value: DateInput): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T09:00:00Z`);
  return value instanceof Date ? value : new Date(value);
}

function parts(value: DateInput) {
  const date = toDate(value);
  if (!Number.isFinite(date.getTime())) return null;
  const map = Object.fromEntries(PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(map.year), month: Number(map.month) - 1, day: Number(map.day),
    weekday: WEEKDAYS[map.weekday] ?? map.weekday, time: `${map.hour}:${map.minute}`,
  };
}

/** "8 Nov 2026" */
export function formatDate(value: DateInput | null | undefined, empty = ""): string {
  const p = value == null || value === "" ? null : parts(value);
  return p ? `${p.day} ${MONTHS[p.month]} ${p.year}` : empty;
}

/** "8 Nov" */
export function formatShortDate(value: DateInput | null | undefined, empty = ""): string {
  const p = value == null || value === "" ? null : parts(value);
  return p ? `${p.day} ${MONTHS[p.month]}` : empty;
}

/** "Sat" */
export function formatWeekday(value: DateInput | null | undefined, empty = ""): string {
  const p = value == null || value === "" ? null : parts(value);
  return p ? p.weekday : empty;
}

/** "11:00", on the 24-hour clock. */
export function formatTime(value: DateInput | null | undefined, empty = ""): string {
  const p = value == null || value === "" ? null : parts(value);
  return p ? p.time : empty;
}

/** "8 Nov 2026, 11:00" */
export function formatDateTime(value: DateInput | null | undefined, empty = ""): string {
  const p = value == null || value === "" ? null : parts(value);
  return p ? `${p.day} ${MONTHS[p.month]} ${p.year}, ${p.time}` : empty;
}

/** "14 Nov to 11 Dec 2026", with the year once when both ends share it. */
export function formatDateRange(start: DateInput, end: DateInput): string {
  const a = parts(start), b = parts(end);
  if (!a || !b) return "";
  if (a.year === b.year && a.month === b.month && a.day === b.day) return formatDate(start);
  return a.year === b.year ? `${a.day} ${MONTHS[a.month]} to ${formatDate(end)}` : `${formatDate(start)} to ${formatDate(end)}`;
}

/** A list stamp: the time today, the weekday this week, then the date. */
export function formatWhen(value: DateInput | null | undefined, now: DateInput = Date.now()): string {
  const p = value == null || value === "" ? null : parts(value);
  const today = parts(now);
  if (!p || !today) return "";
  if (p.year === today.year && p.month === today.month && p.day === today.day) return p.time;
  const age = toDate(now).getTime() - toDate(value!).getTime();
  if (age >= 0 && age < 6 * 86_400_000) return p.weekday;
  return p.year === today.year ? `${p.day} ${MONTHS[p.month]}` : `${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** "45m", "1h 0m", "2d 12h". Anything under a minute rounds up to "1m". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

/** "1 contact", "3 contacts", "1 reply", "2 replies" with an explicit plural. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
