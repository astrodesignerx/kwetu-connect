import {
  DEFAULT_SETTINGS,
  type BlockId,
  type BookingSettings,
  type TimeBlock,
} from "./settings";

export type BookingRequest = {
  lengthSeconds: number;
  howOften: number;
  days: number[];
  blocks: BlockId[];
  /** Exact day and time boxes, as "day-block" (e.g. "6-morning"). When missing, every chosen day gets every chosen block. */
  cells?: string[];
  startDate: string;
  endDate: string;
};

export function cellKey(day: number, block: BlockId): string {
  return `${day}-${block}`;
}

/** The day and time boxes a request books: its own cells, or every chosen day times every chosen block. */
export function requestCells(request: Pick<BookingRequest, "days" | "blocks" | "cells">): string[] {
  if (request.cells && request.cells.length > 0) return request.cells;
  return request.days.flatMap((day) => request.blocks.map((block) => cellKey(day, block)));
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function dateRange(startDate: string, endDate: string): string[] {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return [];
  if (startDate > endDate) return [];
  const dates: string[] = [];
  let date = startDate;
  while (date <= endDate) {
    dates.push(date);
    date = addDays(date, 1);
  }
  return dates;
}

export function screenHourKey(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, "0")}`;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function screenHoursForDate(
  date: string,
  settings: BookingSettings = DEFAULT_SETTINGS
) {
  if (!isValidDate(date)) return null;
  return settings.screenHours[weekdayOf(date)] ?? null;
}

export function isScreenHour(
  date: string,
  hour: number,
  settings: BookingSettings = DEFAULT_SETTINGS
): boolean {
  const screenHours = screenHoursForDate(date, settings);
  if (!screenHours) return false;
  return hour >= screenHours.open && hour < screenHours.close;
}

export function bookedHours(
  request: BookingRequest,
  settings: BookingSettings = DEFAULT_SETTINGS
): string[] {
  const days = new Set(request.days);
  const cells = request.cells && request.cells.length > 0 ? new Set(request.cells) : null;
  const blockIds = request.blocks.filter((id) => Boolean(settings.timeBlocks[id]));
  const blocks: TimeBlock[] = blockIds.map((id) => settings.timeBlocks[id]);

  if (blocks.length === 0) return [];

  const firstBlockHour = Math.min(...blocks.map((block) => block.startHour));
  const lastBlockHour = Math.max(...blocks.map((block) => block.endHour));
  const hours: string[] = [];

  for (const date of dateRange(request.startDate, request.endDate)) {
    const weekday = weekdayOf(date);
    if (!days.has(weekday)) continue;

    const screenHours = settings.screenHours[weekday];
    if (!screenHours) continue;

    const firstHour = Math.max(screenHours.open, firstBlockHour);
    const lastHour = Math.min(screenHours.close, lastBlockHour);

    for (let hour = firstHour; hour < lastHour; hour += 1) {
      const inBlock = blockIds.some(
        (id, index) => (!cells || cells.has(cellKey(weekday, id))) &&
          hour >= blocks[index].startHour && hour < blocks[index].endHour
      );
      if (inBlock) hours.push(screenHourKey(date, hour));
    }
  }

  return hours;
}

export function earliestStartDate(
  paidDate: string,
  settings: BookingSettings = DEFAULT_SETTINGS
): string {
  let date = addDays(paidDate, 1);
  let workingDaysCounted = 0;

  while (workingDaysCounted < settings.leadWorkingDays) {
    const weekday = weekdayOf(date);
    const isWeekend = weekday === 0 || weekday === 6;
    const isHoliday = settings.publicHolidays.includes(date);

    if (!isWeekend && !isHoliday) {
      workingDaysCounted += 1;
    }

    if (workingDaysCounted < settings.leadWorkingDays) {
      date = addDays(date, 1);
    }
  }

  return date;
}
