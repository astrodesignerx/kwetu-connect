import { bookedHours, dateRange, weekdayOf } from "./hours";
import type { ExistingBooking } from "./capacity";
import { DEFAULT_SETTINGS, type BlockId, type BookingSettings } from "./settings";

export type OccupancyCell = { open: boolean; soldShare: number };
export type Occupancy = Record<number, Record<BlockId, OccupancyCell>>;

/** Aggregate seconds only. No advertiser or booking data leaves this function. */
export function occupancyByDayBlock(
  existing: ExistingBooking[], from: string, to: string,
  settings: BookingSettings = DEFAULT_SETTINGS,
): Occupancy {
  const blocks = Object.entries(settings.timeBlocks) as [BlockId, BookingSettings["timeBlocks"][BlockId]][];
  const result = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day,
    Object.fromEntries(blocks.map(([id]) => [id, { open: false, soldShare: 0 }])),
  ])) as Occupancy;
  const hours = Array.from({ length: 7 }, () => Object.fromEntries(blocks.map(([id]) => [id, 0])) as Record<BlockId, number>);
  for (const date of dateRange(from, to)) {
    const day = weekdayOf(date);
    const screen = settings.screenHours[day];
    if (!screen) continue;
    for (const [id, block] of blocks) {
      hours[day][id] += Math.max(0, Math.min(screen.close, block.endHour) - Math.max(screen.open, block.startHour));
    }
  }
  for (const booking of existing) {
    if (!["Paid", "Approved", "Live"].includes(booking.status)) continue;
    const request = { ...booking.request, startDate: booking.request.startDate < from ? from : booking.request.startDate,
      endDate: booking.request.endDate > to ? to : booking.request.endDate };
    for (const key of bookedHours(request, settings)) {
      const [date, hour] = key.split("T");
      const day = weekdayOf(date);
      for (const [id, block] of blocks) {
        if (Number(hour) >= block.startHour && Number(hour) < block.endHour) {
          result[day][id].soldShare += request.lengthSeconds * request.howOften;
        }
      }
    }
  }
  for (let day = 0; day < 7; day++) for (const [id] of blocks) {
    const cell = result[day][id];
    cell.open = hours[day][id] > 0;
    cell.soldShare = cell.open ? cell.soldShare / (settings.secondsForSalePerHour * hours[day][id]) : 0;
  }
  return result;
}
