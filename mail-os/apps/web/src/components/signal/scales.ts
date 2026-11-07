export type SignalDate = string | Date;
export type Point = { x: number; y: number };

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function positiveValues(values: readonly number[]) {
  return values.map((value) => Math.max(0, finite(value)));
}

export function sparkPoints(values: readonly number[], width = 132, height = 40): Point[] {
  const data = values.map((value) => finite(value));
  const w = Math.max(12, finite(width, 132));
  const h = Math.max(12, finite(height, 40));
  const min = Math.min(...data);
  const max = Math.max(...data);
  return data.map((value, index) => ({
    x: data.length === 1 ? w / 2 : 5 + (index / (data.length - 1)) * (w - 10),
    y: max === min ? h / 2 : h - 5 - ((value - min) / (max - min)) * (h - 10),
  }));
}

export function barScale(values: readonly number[]) {
  const data = positiveValues(values);
  const max = Math.max(0, ...data);
  return {
    heights: data.map((value) => max === 0 ? 0 : (value / max) * 100),
    peak: max === 0 ? null : data.indexOf(max),
  };
}

// Calendar maths uses UTC days to keep server and browser output identical.
export function dayNumber(value: SignalDate): number {
  const source = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) throw new RangeError("Use a calendar date in YYYY-MM-DD format.");
  const time = Date.parse(`${source}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== source) {
    throw new RangeError("Invalid calendar date.");
  }
  return time / DAY;
}

export function dateKey(day: number) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function shortDate(day: number) {
  const date = new Date(day * DAY);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function heatmapGrid(today: SignalDate, weeks = 12) {
  const count = Math.max(1, Math.min(53, Math.trunc(finite(weeks, 12))));
  const current = dayNumber(today);
  const weekday = (new Date(current * DAY).getUTCDay() + 6) % 7;
  const start = current - weekday - (count - 1) * 7;
  const columns = Array.from({ length: count }, (_, week) =>
    Array.from({ length: 7 }, (_, weekdayIndex) => {
      const day = start + week * 7 + weekdayIndex;
      return { date: dateKey(day), future: day > current, week, weekday: weekdayIndex };
    }),
  );
  const months: { label: string; week: number; date: string }[] = [];
  columns.forEach((column, week) => {
    const firstOfMonth = column.find((cell) => cell.date.endsWith("-01"));
    const key = firstOfMonth?.date ?? (week === 0 ? column[0].date : null);
    if (key) months.push({ label: MONTHS[new Date(`${key}T00:00:00Z`).getUTCMonth()], week, date: key });
  });
  return { columns, months, start: dateKey(start) };
}

export function flightPosition(startDate: SignalDate, endDate: SignalDate, timelineStart: SignalDate) {
  const origin = dayNumber(timelineStart);
  const start = dayNumber(startDate);
  const end = dayNumber(endDate) + 1;
  if (end <= start || end <= origin || start >= origin + 42) return null;
  const clippedStart = Math.max(origin, start);
  const clippedEnd = Math.min(origin + 42, end);
  return { left: ((clippedStart - origin) / 42) * 100, width: ((clippedEnd - clippedStart) / 42) * 100 };
}

export function todayPosition(today: SignalDate, timelineStart: SignalDate) {
  const offset = dayNumber(today) - dayNumber(timelineStart);
  return offset < 0 || offset >= 42 ? null : (offset / 42) * 100;
}
