import { dateRange, weekdayOf } from "./booking/hours";
import type { Schedule } from "./booking/playlist";
import type { BookingSettings } from "./booking/settings";
import type { BookingListItem } from "./store/types";

export type TimelineBooking = { reference: string; business: string; share: number };
export type TimelineCell = { date: string; block: string; start: number; end: number; bookings: TimelineBooking[]; share: number };

// Read the generated playlists so the visual only includes adverts in the actual schedule.
export function scheduleCells(schedule: Schedule, bookings: BookingListItem[], settings: BookingSettings, from: string, to: string): TimelineCell[] {
  const names = new Map(bookings.map((booking) => [booking.reference, booking.business]));
  const totals = new Map(schedule.playlists.map((playlist) => {
    const seconds = new Map<string, number>();
    for (const item of playlist.items) if (item.kind === "advert") seconds.set(item.bookingId, (seconds.get(item.bookingId) ?? 0) + item.seconds);
    return [playlist.name, seconds];
  }));
  return dateRange(from, to).flatMap((date) => Object.entries(settings.timeBlocks).map(([id, block]) => {
    const screen = settings.screenHours[weekdayOf(date)];
    const start = Math.max(block.startHour, screen?.open ?? block.endHour);
    const end = Math.max(start, Math.min(block.endHour, screen?.close ?? block.startHour));
    const seconds = new Map<string, number>();
    for (let hour = start; hour < end; hour++) {
      const row = schedule.rows.find((entry) => entry.startDate <= date && entry.endDate >= date && entry.startHour <= hour && entry.endHour > hour);
      for (const [reference, value] of totals.get(row?.playlist ?? "") ?? []) seconds.set(reference, (seconds.get(reference) ?? 0) + value);
    }
    const available = (end - start) * settings.secondsForSalePerHour;
    const entries = [...seconds].map(([reference, value]) => ({ reference, business: names.get(reference) ?? reference, share: available ? value / available : 0 }));
    return { date, block: id, start, end, bookings: entries, share: entries.reduce((sum, entry) => sum + entry.share, 0) };
  }));
}
