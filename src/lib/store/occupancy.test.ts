import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory";
import type { QuoteInput } from "./types";
import { DEFAULT_SETTINGS } from "../booking/settings";

const input: QuoteInput = { name: "Private name", phone: "0712345678", email: "private@example.test", business: "Private business", paysBy: "now",
  request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-07", endDate: "2026-12-04" } };

describe("store occupancy", () => {
  it("updates shares as a Quote becomes Paid and Approved, then releases cancelled time", async () => {
    const store = new MemoryStore();
    const booking = await store.createQuote(input, "2026-11-02");
    const read = () => store.occupancy("2026-11-02", "2026-11-08");
    expect((await read())[6].morning.soldShare).toBe(0);
    await store.savePaymentNote(booking.reference, "QA-PAYMENT");
    await store.move(booking.reference, "Paid", "staff@example.test", "", "2026-11-02");
    expect((await read())[6].morning.soldShare).toBe(100 / 2700);
    await store.addAdvert(booking.reference, { name: "advert.png", type: "image/png", size: 100, arrayBuffer: async () => new ArrayBuffer(100) }, 10);
    const detail = await store.bookingDetail(booking.reference);
    await store.decideAdvert(booking.reference, detail!.adverts[0].id, "approved", "");
    await store.move(booking.reference, "Approved", "staff@example.test", "", "2026-11-02");
    expect((await read())[6].morning.soldShare).toBe(100 / 2700);
    await store.move(booking.reference, "Cancelled", "staff@example.test", "Client cancelled", "2026-11-02");
    expect((await read())[6].morning.soldShare).toBe(0);
    expect((await store.bookingDetail(booking.reference))!.history).toHaveLength(3);
  });
  it("exposes only shares and honours saved sale capacity and screen hours", async () => {
    const store = new MemoryStore();
    await store.saveSettings({ ...DEFAULT_SETTINGS, secondsForSalePerHour: 1000 });
    const booking = await store.createQuote(input, "2026-11-02");
    await store.savePaymentNote(booking.reference, "QA-PAYMENT");
    await store.move(booking.reference, "Paid", "staff@example.test", "", "2026-11-02");
    const occupancy = await store.occupancy("2026-11-02", "2026-11-08");
    expect(occupancy[6].morning.soldShare).toBe(0.1);
    expect(occupancy[1].late.open).toBe(false);
    for (const privateValue of [input.name, input.business, input.phone, input.email!, booking.reference]) expect(JSON.stringify(occupancy)).not.toContain(privateValue);
    expect(Object.values(occupancy).flatMap(Object.values).every((c) => Object.keys(c).sort().join() === "open,soldShare")).toBe(true);
  });
  it("rejects malformed, reversed and excessive date ranges", async () => {
    const store = new MemoryStore();
    for (const [from, to] of [["bad", "2026-11-08"], ["2026-11-08", "2026-11-02"], ["2026-01-01", "2027-01-02"]]) {
      await expect(store.occupancy(from, to)).rejects.toThrow("Choose dates in order");
    }
  });
});
