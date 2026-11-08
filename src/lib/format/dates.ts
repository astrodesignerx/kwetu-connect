// Short, readable dates for the manager. Inputs are ISO dates (2026-11-14); never use these for URLs, forms or CSV.
const at = (iso: string) => new Date(iso + "T12:00:00Z");
const format = (iso: string, options: Intl.DateTimeFormatOptions) => at(iso).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });

/** "14 Nov" */
export const shortDate = (iso: string) => format(iso, { day: "numeric", month: "short" });

/** "Sat 7 Nov" */
export const dayDate = (iso: string) => format(iso, { weekday: "short", day: "numeric", month: "short" });

/** "14 Nov to 11 Dec". Adds the year when the dates span two years or the range is not in the current year. */
export function dateRange(fromIso: string, toIso: string, now: Date = new Date()) {
  const year = (iso: string) => at(iso).getUTCFullYear();
  const withYear = year(fromIso) !== year(toIso) || year(fromIso) !== now.getUTCFullYear();
  const part = (iso: string) => withYear ? format(iso, { day: "numeric", month: "short", year: "numeric" }) : shortDate(iso);
  return part(fromIso) + " to " + part(toIso);
}
