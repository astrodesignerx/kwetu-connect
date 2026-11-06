import type { BookingStatus, CapacityResult, ExistingBooking } from "../booking/capacity";
import type { BookingRequest } from "../booking/hours";
import type { BookingSettings } from "../booking/settings";
import type { Schedule } from "../booking/playlist";
import type { Occupancy } from "../booking/occupancy";

export type Advertiser = {
  id: string; name: string; phone: string; email: string; business: string;
  paysBy: "now" | "invoice"; createdAt: string;
};
export type Booking = ExistingBooking & {
  reference: string; plays: number; fullPriceKes: number; discountPercent: number;
  priceKes: number; paymentNote: string; createdAt: string; updatedAt: string;
};
export type Advert = {
  id: string; bookingId: string; filePath: string; fileName: string; seconds: number;
  decision: "waiting" | "approved" | "refused"; reason: string; createdAt: string;
};
export type StatusChange = {
  id: string; bookingId: string; fromStatus: BookingStatus; toStatus: BookingStatus;
  staffEmail: string; note: string; createdAt: string;
};
export type QuoteInput = {
  request: BookingRequest; name: string; phone: string; email?: string;
  business: string; paysBy: "now" | "invoice"; website?: string;
};
export type BookingDetail = { booking: Booking; advertiser: Advertiser; adverts: Advert[]; history: StatusChange[]; capacity: CapacityResult };
/** One step a booking has passed, for the customer's progress track. No staff names. */
export type PublicStep = { status: BookingStatus; at: string };
export type PublicBooking = Pick<Booking, "reference" | "request" | "plays" | "fullPriceKes" | "discountPercent" | "priceKes" | "status" | "createdAt"> & {
  capacity: CapacityResult; steps: PublicStep[];
  /** How many advert files came with this booking (names and files stay private). */
  adverts: number;
  /** Set when the customer changed the plan: the reference that replaced this one. */
  replacedBy?: string;
};
export type BookingFilter = { status?: string; from?: string; to?: string };
export type BookingListItem = Booking & { business: string };
export type AdvertUpload = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
export interface BookingStore {
  readonly mode: "memory" | "supabase";
  getSettings(): Promise<BookingSettings>;
  saveSettings(settings: unknown): Promise<void>;
  isStaff(email: string): Promise<boolean>;
  createQuote(input: QuoteInput, today?: string): Promise<PublicBooking>;
  publicBooking(reference: string): Promise<PublicBooking | null>;
  /** Change an unpaid booking while keeping its reference. */
  replaceQuote(reference: string, request: unknown, today?: string): Promise<PublicBooking>;
  /** The booking only if the phone matches the one it was made with. */
  findBooking(reference: string, phone: string): Promise<PublicBooking | null>;
  /** Open bookings made with this email, with the name to greet. */
  bookingsByEmail(email: string): Promise<{ name: string; bookings: PublicBooking[] }>;
  listBookings(filter?: BookingFilter): Promise<BookingListItem[]>;
  bookingDetail(reference: string): Promise<BookingDetail | null>;
  savePaymentNote(reference: string, note: string): Promise<void>;
  move(reference: string, to: BookingStatus, staffEmail: string, note: string, today?: string): Promise<void>;
  addAdvert(reference: string, file: AdvertUpload, seconds: number): Promise<void>;
  decideAdvert(reference: string, id: string, decision: "approved" | "refused", reason: string): Promise<void>;
  advertUrl(reference: string, id: string): Promise<string | null>;
  schedule(from: string, to: string): Promise<Schedule>;
  occupancy(from: string, to: string): Promise<Occupancy>;
}
