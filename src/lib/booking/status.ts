import type { BookingStatus, CapacityResult } from "./capacity";
import { addDays, weekdayOf, type BookingRequest } from "./hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

export const STATUSES: BookingStatus[] = ["Quote", "Paid", "Approved", "Live", "Finished", "Cancelled"];
export type MoveContext = {
  request: BookingRequest;
  paymentNote: string;
  note?: string;
  capacity?: CapacityResult;
  settings?: BookingSettings;
};
export function canMove(from: BookingStatus, to: BookingStatus, booking: MoveContext, adverts: { decision: string; seconds: number }[], today: string): { ok: boolean; reason: string } {
  const refuse = (reason: string) => ({ ok: false, reason });
  if (from === "Finished" || from === "Cancelled") return refuse(`Nothing leaves ${from}.`);
  if (to === "Cancelled") return booking.note?.trim() ? { ok: true, reason: "" } : refuse("Add a cancellation note.");
  if (from === "Quote" && to === "Paid") {
    if (!booking.paymentNote.trim()) return refuse("Add an M-Pesa code or invoice number.");
    if (!booking.capacity?.ok) return refuse("Space is unavailable in one or more screen hours. Check the full hours and suggestions.");
    return { ok: true, reason: "" };
  }
  if (from === "Paid" && to === "Approved") {
    const approved = adverts.filter((advert) => advert.decision === "approved");
    if (!approved.length) return refuse("Approve at least one advert first.");
    if (approved.some((advert) => advert.seconds !== booking.request.lengthSeconds)) return refuse("Every approved advert must match the booking length.");
    const settings = booking.settings ?? DEFAULT_SETTINGS;
    let deadline = addDays(booking.request.startDate, -1);
    while ([0, 6].includes(weekdayOf(deadline)) || settings.publicHolidays.includes(deadline)) deadline = addDays(deadline, -1);
    if (today > deadline) return refuse("Approval needs at least 1 working day before the start date.");
    return { ok: true, reason: "" };
  }
  if (from === "Approved" && to === "Live") return today >= booking.request.startDate ? { ok: true, reason: "" } : refuse("The start date has not arrived.");
  if (from === "Live" && to === "Finished") return today > booking.request.endDate ? { ok: true, reason: "" } : refuse("Finish only after the end date.");
  return refuse(`Cannot move from ${from} to ${to}.`);
}
