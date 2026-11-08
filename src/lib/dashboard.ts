import { addDays, bookedHours, formatHour, weekdayOf } from "./booking/hours";
import { BLOCK_ORDER } from "./booking/selection";
import type { BookingSettings } from "./booking/settings";
import type { BookingListItem } from "./store/types";
import type { Occupancy } from "./booking/occupancy";
import type { Schedule } from "./booking/playlist";

export function nairobiClock(now: Date) {
  const local = new Date(now.getTime() + 3 * 3600000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours(), second: local.getUTCMinutes() * 60 + local.getUTCSeconds() };
}
export function onAirStatus(settings: BookingSettings, now: Date) {
  const clock = nairobiClock(now);
  const hours = settings.screenHours[weekdayOf(clock.date)];
  if (hours && clock.hour >= hours.open && clock.hour < hours.close) return { onAir: true, label: "Screen on air now" };
  for (let offset = 0; offset <= 7; offset++) {
    const next = settings.screenHours[weekdayOf(addDays(clock.date, offset))];
    if (next && next.open < next.close && (offset > 0 || clock.hour < next.open)) return { onAir: false, label: "Screen off air, back at " + formatHour(next.open) + (offset > 1 ? " on " + addDays(clock.date, offset) : offset === 1 ? " tomorrow" : "") };
  }
  return { onAir: false, label: "Screen off air, hours not set" };
}
export function weeklyTotals(bookings: BookingListItem[], monday: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const from = addDays(monday, (index - 6) * 7);
    const to = addDays(from, 6);
    const selected = bookings.filter((booking) => {
      const created = nairobiClock(new Date(booking.createdAt)).date;
      return booking.status !== "Cancelled" && created >= from && created <= to;
    });
    return { from, count: selected.length, kes: selected.reduce((total, booking) => total + booking.priceKes, 0) };
  });
}
export function hourShares(bookings: BookingListItem[], date: string, settings: BookingSettings) {
  const screen = settings.screenHours[weekdayOf(date)];
  if (!screen) return [];
  const seconds = new Map<number, number>();
  for (const booking of bookings) {
    if (!["Paid", "Approved", "Live"].includes(booking.status) || booking.request.startDate > date || booking.request.endDate < date) continue;
    for (const key of bookedHours({ ...booking.request, startDate: date, endDate: date }, settings)) {
      const hour = Number(key.split("T")[1]);
      seconds.set(hour, (seconds.get(hour) ?? 0) + booking.request.lengthSeconds * booking.request.howOften);
    }
  }
  return Array.from({ length: screen.close - screen.open }, (_, index) => ({ hour: screen.open + index, share: (seconds.get(screen.open + index) ?? 0) / settings.secondsForSalePerHour }));
}
/** Averages a week of hourly shares into one figure per day for each time block. A block closed all week is left out. */
export function blockShares(days: { date: string; label: string; hours: { hour: number; share: number; closed?: boolean }[] }[], settings: BookingSettings) {
  return BLOCK_ORDER.map((id) => {
    const block = settings.timeBlocks[id];
    const cells = days.map(({ date, label, hours }) => {
      const open = hours.filter((item) => !item.closed && item.hour >= block.startHour && item.hour < block.endHour);
      return { date, label, share: open.length ? open.reduce((sum, item) => sum + item.share, 0) / open.length : null };
    });
    return { id, label: block.label, startHour: block.startHour, endHour: block.endHour, cells };
  }).filter((block) => block.cells.some((cell) => cell.share !== null));
}
export function weekSold(occupancy: Occupancy, settings: BookingSettings) {
  let sold = 0;
  let total = 0;
  for (let day = 0; day < 7; day++) for (const [id, block] of Object.entries(settings.timeBlocks)) {
    const screen = settings.screenHours[day];
    if (!screen) continue;
    const hours = Math.max(0, Math.min(screen.close, block.endHour) - Math.max(screen.open, block.startHour));
    total += hours;
    sold += hours * occupancy[day][id as keyof typeof settings.timeBlocks].soldShare;
  }
  return total ? sold / total : 0;
}
export function currentPlaylist(schedule: Schedule, date: string, hour: number, second: number) {
  const row = schedule.rows.find((item) => item.startDate <= date && item.endDate >= date && hour >= item.startHour && hour < item.endHour);
  const items = schedule.playlists.find((playlist) => playlist.name === row?.playlist)?.items ?? [];
  const index = items.findIndex((item) => second >= item.start && second < item.start + item.seconds);
  return { current: index >= 0 ? items[index] : null, next: index >= 0 ? items[index + 1] ?? items[0] : null };
}
