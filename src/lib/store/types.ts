import type { BookingStatus, CapacityResult, ExistingBooking } from "../booking/capacity";
import type { BookingRequest } from "../booking/hours";
import type { BookingSettings } from "../booking/settings";
import type { Schedule } from "../booking/playlist";

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
export type PublicBooking = Pick<Booking, "reference" | "request" | "plays" | "fullPriceKes" | "discountPercent" | "priceKes" | "status"> & { capacity: CapacityResult };
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
  listBookings(filter?: BookingFilter): Promise<BookingListItem[]>;
  bookingDetail(reference: string): Promise<BookingDetail | null>;
  savePaymentNote(reference: string, note: string): Promise<void>;
  move(reference: string, to: BookingStatus, staffEmail: string, note: string, today?: string): Promise<void>;
  addAdvert(reference: string, file: AdvertUpload, seconds: number): Promise<void>;
  decideAdvert(reference: string, id: string, decision: "approved" | "refused", reason: string): Promise<void>;
  advertUrl(reference: string, id: string): Promise<string | null>;
  schedule(from: string, to: string): Promise<Schedule>;
}
