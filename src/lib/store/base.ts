import { randomBytes, randomUUID } from "node:crypto";
import { checkCapacity, type BookingStatus } from "../booking/capacity";
import { earliestStartDate } from "../booking/hours";
import { quote } from "../booking/quote";
import { buildSchedule } from "../booking/playlist";
import { DEFAULT_SETTINGS, type BookingSettings } from "../booking/settings";
import { canMove } from "../booking/status";
import type { Advert, Advertiser, AdvertUpload, Booking, BookingFilter, BookingStore, PublicBooking, QuoteInput, StatusChange } from "./types";
import { dateWindow, ensure, text, todayInNairobi, validateQuote, validateSettings } from "./validation";

export type StoreData = {
  revision: number; settings: BookingSettings | null;
  advertisers: Advertiser[]; bookings: Booking[]; adverts: Advert[]; history: StatusChange[];
};
export function emptyData(): StoreData {
  return { revision: 0, settings: null, advertisers: [], bookings: [], adverts: [], history: [] };
}
export abstract class BaseStore implements BookingStore {
  abstract readonly mode: "memory" | "supabase";
  protected abstract read(): Promise<StoreData>;
  protected abstract transaction<T>(change: (data: StoreData) => T): Promise<T>;
  abstract isStaff(email: string): Promise<boolean>;
  protected abstract upload(path: string, file: AdvertUpload): Promise<void>;
  protected abstract removeUpload(path: string): Promise<void>;
  protected abstract fileUrl(path: string): Promise<string | null>;
  private settings(data: StoreData) { return data.settings ?? structuredClone(DEFAULT_SETTINGS); }
  private find(data: StoreData, reference: string) {
    const booking = data.bookings.find((b) => b.reference === reference);
    ensure(booking, "Booking not found.");
    return booking;
  }
  private capacity(data: StoreData, booking: Booking) {
    const phone = data.advertisers.find((a) => a.id === booking.advertiserId)?.phone;
    const samePhone = new Set(data.advertisers.filter((a) => a.phone === phone).map((a) => a.id));
    const existing = data.bookings.filter((b) => b.id !== booking.id).map((b) => samePhone.has(b.advertiserId) ? { ...b, advertiserId: booking.advertiserId } : b);
    return checkCapacity(booking.request, booking.advertiserId, existing, this.settings(data));
  }
  private publicView(data: StoreData, b: Booking): PublicBooking {
    return { reference: b.reference, request: b.request, plays: b.plays, fullPriceKes: b.fullPriceKes, discountPercent: b.discountPercent, priceKes: b.priceKes, status: b.status, capacity: this.capacity(data, b) };
  }
  async getSettings() { return structuredClone(this.settings(await this.read())); }
  async saveSettings(input: unknown) {
    const settings = validateSettings(input);
    await this.transaction((data) => { data.settings = settings; });
  }
  async createQuote(raw: QuoteInput, today = todayInNairobi()) {
    const input = validateQuote(raw);
    return this.transaction((data) => {
      const settings = this.settings(data);
      ensure(input.request.startDate >= earliestStartDate(today, settings), "The start date is before the earliest available start. Choose a later date.");
      const result = quote(input.request, settings);
      ensure(result.ok, result.ok ? "" : result.errors.join(" "));
      ensure(!result.belowMinimum, `The smallest order is KES ${settings.minOrderKes.toLocaleString("en-GB")}.`);
      ensure(input.paysBy !== "invoice" || result.priceKes >= 50000, "Pay by invoice is available from KES 50,000.");
      const phoneIds = new Set(data.advertisers.filter((a) => a.phone === input.phone).map((a) => a.id));
      const dayQuotes = data.bookings.filter((b) => phoneIds.has(b.advertiserId) && this.localDate(b.createdAt) === today);
      ensure(dayQuotes.length < 5, "This phone number has reached 5 Quotes today. Please contact KCA.");
      const now = new Date().toISOString();
      // Keep each submitted contact record private to its booking.
      const advertiser: Advertiser = { id: randomUUID(), name: input.name, phone: input.phone, email: input.email ?? "", business: input.business, paysBy: input.paysBy, createdAt: now };
      data.advertisers.push(advertiser);
      let reference: string;
      do { reference = `KCA-${randomBytes(8).toString("hex").toUpperCase()}`; } while (data.bookings.some((b) => b.reference === reference));
      const booking: Booking = { id: randomUUID(), advertiserId: advertiser.id, reference, request: input.request, plays: result.plays, fullPriceKes: result.fullPriceKes, discountPercent: result.discountPercent, priceKes: result.priceKes, status: "Quote", paymentNote: "", createdAt: now, updatedAt: now };
      data.bookings.push(booking);
      return this.publicView(data, booking);
    });
  }
  private localDate(value: string) {
    const date = new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }
  async publicBooking(reference: string) {
    const data = await this.read();
    const booking = data.bookings.find((b) => b.reference === reference);
    return booking ? structuredClone(this.publicView(data, booking)) : null;
  }
  async listBookings(filter: BookingFilter = {}) {
    const data = await this.read();
    return data.bookings.filter((b) => (!filter.status || b.status === filter.status) && (!filter.from || b.request.endDate >= filter.from) && (!filter.to || b.request.startDate <= filter.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .map((b) => ({ ...b, business: data.advertisers.find((a) => a.id === b.advertiserId)?.business ?? "" }));
  }
  async bookingDetail(reference: string) {
    const data = await this.read();
    const booking = data.bookings.find((b) => b.reference === reference);
    if (!booking) return null;
    const advertiser = data.advertisers.find((a) => a.id === booking.advertiserId);
    ensure(advertiser, "Advertiser not found.");
    return structuredClone({ booking, advertiser, adverts: data.adverts.filter((a) => a.bookingId === booking.id), history: data.history.filter((h) => h.bookingId === booking.id), capacity: this.capacity(data, booking) });
  }
  async savePaymentNote(reference: string, raw: string) {
    const note = text(raw, "a payment note", 200);
    await this.transaction((data) => {
      const b = this.find(data, reference);
      ensure(b.status !== "Finished" && b.status !== "Cancelled", "This booking is closed.");
      b.paymentNote = note; b.updatedAt = new Date().toISOString();
    });
  }
  async move(reference: string, to: BookingStatus, staffEmail: string, rawNote: string, today = todayInNairobi()) {
    const note = text(rawNote, "a note", 500, true);
    text(staffEmail, "a staff email", 254);
    await this.transaction((data) => {
      const b = this.find(data, reference);
      const rule = canMove(b.status, to, { ...b, note, capacity: this.capacity(data, b), settings: this.settings(data) }, data.adverts.filter((a) => a.bookingId === b.id), today);
      ensure(rule.ok, rule.reason);
      data.history.push({ id: randomUUID(), bookingId: b.id, fromStatus: b.status, toStatus: to, staffEmail, note, createdAt: new Date().toISOString() });
      b.status = to; b.updatedAt = new Date().toISOString();
    });
  }
  async addAdvert(reference: string, file: AdvertUpload, seconds: number) {
    const fileName = text(file.name, "a file name", 150);
    ensure(/^[a-zA-Z0-9][a-zA-Z0-9_. ()-]*$/.test(fileName), "Use a file name starting with a letter or number, using letters, numbers, spaces, dots, brackets or hyphens.");
    ensure(["video/mp4", "image/png", "image/jpeg"].includes(file.type), "Upload an MP4, PNG or JPEG advert.");
    ensure(file.size > 0 && file.size <= 50 * 1024 * 1024, "Adverts must be up to 50 MB.");
    ensure(Number.isInteger(seconds) && seconds > 0 && seconds <= 3600, "Enter the advert length in whole seconds.");
    const before = await this.bookingDetail(reference);
    ensure(before, "Booking not found.");
    ensure(before.adverts.length < 3, "At most 3 adverts per booking.");
    const path = `${before.booking.id}/${randomUUID()}/${fileName}`;
    await this.upload(path, file);
    try {
      await this.transaction((data) => {
        const b = this.find(data, reference);
        ensure(b.status !== "Finished" && b.status !== "Cancelled", "This booking is closed.");
        ensure(data.adverts.filter((a) => a.bookingId === b.id).length < 3, "At most 3 adverts per booking.");
        data.adverts.push({ id: randomUUID(), bookingId: b.id, filePath: this.mode === "memory" ? "" : path, fileName, seconds, decision: "waiting", reason: "", createdAt: new Date().toISOString() });
      });
    } catch (error) { await this.removeUpload(path); throw error; }
  }
  async decideAdvert(reference: string, id: string, decision: "approved" | "refused", rawReason: string) {
    ensure(decision === "approved" || decision === "refused", "Choose approved or refused.");
    // Only a refusal needs a reason; approving can be one click.
    const reason = text(rawReason ?? "", "a reason for refusing", 500, decision === "approved");
    await this.transaction((data) => {
      const b = this.find(data, reference);
      ensure(b.status !== "Finished" && b.status !== "Cancelled", "This booking is closed.");
      const advert = data.adverts.find((a) => a.id === id && a.bookingId === b.id);
      ensure(advert, "Advert not found.");
      if (b.status === "Approved" || b.status === "Live") {
        ensure(decision !== "approved" || advert.seconds === b.request.lengthSeconds, "The advert must match the booking length.");
        ensure(decision === "approved" || data.adverts.some((a) => a.bookingId === b.id && a.id !== id && a.decision === "approved"), "Keep at least one approved advert while this booking is Approved or Live.");
      }
      advert.decision = decision; advert.reason = reason;
    });
  }
  async advertUrl(reference: string, id: string) {
    const detail = await this.bookingDetail(reference);
    const advert = detail?.adverts.find((a) => a.id === id);
    ensure(advert, "Advert not found.");
    return advert.filePath ? this.fileUrl(advert.filePath) : null;
  }
  async schedule(from: string, to: string) {
    dateWindow(from, to, 93);
    const data = await this.read();
    const bookings = data.bookings.filter((b) => b.status === "Approved" || b.status === "Live").map((b) => {
      const adverts = data.adverts.filter((a) => a.bookingId === b.id && a.decision === "approved");
      ensure(adverts.length > 0 && adverts.every((a) => a.seconds === b.request.lengthSeconds), `Check approved adverts for ${b.reference}.`);
      return { bookingId: b.reference, request: b.request, adverts: adverts.map((a) => a.filePath || a.fileName) };
    });
    return buildSchedule(bookings, from, to, this.settings(data));
  }
}
