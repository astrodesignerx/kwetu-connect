import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "./memory";
import type { QuoteInput } from "./types";

const input: QuoteInput = { name: "Amina", phone: "0712345678", email: "amina@example.test", business: "Small shop", paysBy: "now", request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-02", endDate: "2026-11-29" } };
const file = { name: "shop.mp4", type: "video/mp4", size: 100, arrayBuffer: async () => new ArrayBuffer(100) };
let store: MemoryStore;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T10:00:00Z")); store = new MemoryStore(); });
afterEach(() => vi.useRealTimers());

describe("coming back to a booking", () => {
  it("updates an unpaid plan under the same reference and retains the advert for review", async () => {
    const old = await store.createQuote(input);
    await store.addAdvert(old.reference, file, 10);
    const next = await store.replaceQuote(old.reference, { ...input.request, lengthSeconds: 20 });
    expect(next.reference).toBe(old.reference);
    expect(next.priceKes).toBe(old.priceKes * 2);
    expect(next.status).toBe("Quote");
    const before = await store.publicBooking(old.reference);
    expect(before?.status).toBe("Quote");
    expect(before?.priceKes).toBe(next.priceKes);
    const detail = await store.bookingDetail(next.reference);
    expect(detail?.adverts).toHaveLength(1);
    expect(detail?.adverts[0].decision).toBe("waiting");
    expect(detail?.advertiser.phone).toBe("254712345678");
  });
  it("refuses to change a paid booking or an invalid plan", async () => {
    const b = await store.createQuote(input);
    await expect(store.replaceQuote(b.reference, { ...input.request, howOften: 1 })).rejects.toThrow("smallest");
    await store.savePaymentNote(b.reference, "MPESA123");
    await expect(store.replaceQuote(b.reference, input.request)).rejects.toThrow("Payment has been recorded");
    await store.move(b.reference, "Paid", "staff@example.test", "");
    await expect(store.replaceQuote(b.reference, input.request)).rejects.toThrow("paid or closed");
  });
  it("finds a booking only with the matching phone, in any common form", async () => {
    const b = await store.createQuote(input);
    expect((await store.findBooking(b.reference.toLowerCase(), "+254 712 345 678"))?.reference).toBe(b.reference);
    expect(await store.findBooking(b.reference, "0799999999")).toBeNull();
    expect(await store.findBooking("KCA-0000000000000000", input.phone)).toBeNull();
  });
  it("lists open bookings by email and keeps the progress steps without staff names", async () => {
    const b = await store.createQuote(input);
    await store.savePaymentNote(b.reference, "MPESA123");
    await store.move(b.reference, "Paid", "staff@example.test", "");
    const found = await store.bookingsByEmail("AMINA@example.test ");
    expect(found.name).toBe("Amina");
    expect(found.bookings.map((x) => x.reference)).toEqual([b.reference]);
    expect(found.bookings[0].steps.map((s) => s.status)).toEqual(["Paid"]);
    expect(JSON.stringify(found.bookings)).not.toContain("staff@example.test");
    expect((await store.bookingsByEmail("nobody@example.test")).bookings).toEqual([]);
  });
});
