import { addDays, isValidDate, type BookingRequest } from "../booking/hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "../booking/settings";
import { fromCells, parseCell } from "../booking/selection";
import type { QuoteInput } from "./types";

export class StoreError extends Error {}
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new StoreError(message);
}
export function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function text(value: unknown, label: string, max = 200, optional = false): string {
  ensure(typeof value === "string", `Enter ${label}.`);
  const clean = value.trim();
  ensure((optional || clean.length > 0) && clean.length <= max && !/[\u0000-\u001f]/.test(clean), `Enter ${label} using up to ${max} characters.`);
  return clean;
}
export function dateWindow(from: string, to: string, maxDays = 366) {
  ensure(isValidDate(from) && isValidDate(to) && from <= to && to <= addDays(from, maxDays - 1), `Choose dates in order, up to ${maxDays} days apart.`);
}
/** Kenyan numbers to one form (2547...); null when it is not a phone number. */
export function normalisePhone(raw: string): string | null {
  if (typeof raw !== "string" || !/^\+?[\d\s()\-]+$/.test(raw.trim())) return null;
  let phone = raw.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  if (/^[17]\d{8}$/.test(phone)) phone = `254${phone}`;
  return /^\d{9,15}$/.test(phone) ? phone : null;
}
export function validateQuote(input: QuoteInput): QuoteInput {
  ensure(input && typeof input === "object", "Enter your booking details.");
  ensure(!input.website, "Unable to save this request.");
  const name = text(input.name, "your name", 100);
  const business = text(input.business, "your business", 150);
  const rawPhone = text(input.phone, "a phone number", 30);
  ensure(/^\+?[\d\s()\-]+$/.test(rawPhone), "Enter a valid phone number.");
  let phone = rawPhone.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  if (/^[17]\d{8}$/.test(phone)) phone = `254${phone}`;
  ensure(/^\d{9,15}$/.test(phone), "Enter a valid phone number.");
  const email = text(input.email ?? "", "a valid email", 254, true).toLowerCase();
  ensure(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email.");
  ensure(input.paysBy === "now" || input.paysBy === "invoice", "Choose how to pay.");
  const request = input.request as BookingRequest | undefined;
  ensure(request && typeof request === "object", "Choose your plays first.");
  ensure(Array.isArray(request.days) && request.days.length > 0 && request.days.length <= 7 && request.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), "Choose valid days.");
  ensure(Array.isArray(request.blocks) && request.blocks.length > 0 && request.blocks.length <= 5 && request.blocks.every((b) => Object.hasOwn(DEFAULT_SETTINGS.timeBlocks, b)), "Choose valid time blocks.");
  ensure(typeof request.startDate === "string" && typeof request.endDate === "string", "Choose real dates.");
  dateWindow(request.startDate, request.endDate);
  let clean: BookingRequest = { lengthSeconds: request.lengthSeconds, howOften: request.howOften, days: request.days, blocks: request.blocks, startDate: request.startDate, endDate: request.endDate };
  if (request.cells !== undefined) {
    ensure(Array.isArray(request.cells) && request.cells.length > 0 && request.cells.length <= 35 && request.cells.every((c) => typeof c === "string" && parseCell(c) !== null), "Choose valid days and times.");
    clean = { ...clean, ...fromCells(request.cells) };
  }
  return { request: structuredClone(clean), name, phone, email, business, paysBy: input.paysBy };
}
export function validateSettings(value: unknown): BookingSettings {
  ensure(value && typeof value === "object", "Enter all settings.");
  const s = value as BookingSettings;
  const whole = (n: number, label: string, max = 1000000000) => ensure(Number.isSafeInteger(n) && n > 0 && n <= max, `${label} must be a positive whole number up to ${max}.`);
  whole(s.kesPerSecond, "KES per second"); whole(s.minOrderKes, "Smallest order");
  whole(s.secondsForSalePerHour, "Seconds for sale per hour", 3600);
  whole(s.maxPlaysPerAdvertiserPerHour, "Maximum plays per advertiser per hour", 720);
  whole(s.leadWorkingDays, "Lead working days", 260);
  ensure(Array.isArray(s.lengths) && s.lengths.length > 0 && s.lengths.length <= 20, "Add available lengths.");
  s.lengths.forEach((n) => { whole(n, "Length", 3600); ensure(n % 5 === 0, "Lengths must be multiples of 5 seconds."); });
  ensure(new Set(s.lengths).size === s.lengths.length, "Lengths must be unique.");
  ensure(Array.isArray(s.howOften) && s.howOften.length > 0 && s.howOften.length <= 20, "Add how often choices.");
  s.howOften.forEach((o) => { ensure(o && typeof o === "object", "Enter a how often choice."); whole(o.plays, "Plays per hour", 720); ensure(720 % o.plays === 0, "Plays per hour must divide 720 evenly."); text(o.label, "a how often label", 80); });
  ensure(new Set(s.howOften.map((o) => o.plays)).size === s.howOften.length, "How often choices must be unique.");
  ensure(Array.isArray(s.discountSteps) && s.discountSteps.length <= 20, "Enter discount steps.");
  s.discountSteps.forEach((step, index) => {
    ensure(step && typeof step === "object", "Enter a discount step.");
    whole(step.minPlays, "Discount plays"); whole(step.percent, "Discount percent", 99);
    if (index > 0) ensure(s.discountSteps[index - 1].minPlays > step.minPlays && s.discountSteps[index - 1].percent > step.percent, "Sort discount steps from highest plays and percent to lowest.");
  });
  ensure(s.screenHours && s.timeBlocks, "Enter screen hours and time blocks.");
  const hours = (start: number, end: number) => ensure(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= 24, "Hours must be whole numbers inside 0 to 24, with the end after the start.");
  for (let d = 0; d < 7; d++) { const h = s.screenHours[d]; ensure(h, "Enter screen hours for every day."); hours(h.open, h.close); }
  for (const id of Object.keys(DEFAULT_SETTINGS.timeBlocks) as (keyof BookingSettings["timeBlocks"])[]) { const b = s.timeBlocks[id]; ensure(b, "Enter every time block."); hours(b.startHour, b.endHour); text(b.label, "a time block label", 80); }
  ensure(Array.isArray(s.publicHolidays) && s.publicHolidays.length <= 366 && s.publicHolidays.every((d) => typeof d === "string" && isValidDate(d)), "Enter real public holiday dates.");
  return structuredClone(s);
}
