import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "./memory";
import { DEFAULT_SETTINGS } from "../booking/settings";
import { buildSchedule } from "../booking/playlist";
import type { QuoteInput } from "./types";
import { validateSettings } from "./validation";
const input: QuoteInput = { name: "Amina", phone: "0712345678", email: "", business: "Small shop", paysBy: "now", request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-02", endDate: "2026-11-29" } };
const file = { name: "shop.mp4", type: "video/mp4", size: 100, arrayBuffer: async () => new ArrayBuffer(100) };
let store: MemoryStore;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T10:00:00Z")); store = new MemoryStore(); });
afterEach(() => vi.useRealTimers());
async function paid(phone = input.phone) {
  const b = await store.createQuote({ ...input, phone });
  await store.savePaymentNote(b.reference, "MPESA123");
  await store.move(b.reference, "Paid", "staff@example.test", "");
  return b;
}
describe("memory booking store", () => {
  it("creates a Quote, recomputes prices and exposes no contacts", async () => {
    await store.saveSettings({ ...DEFAULT_SETTINGS, kesPerSecond: 2 });
    const b = await store.createQuote({ ...input, priceKes: 1 } as QuoteInput);
    expect(b.priceKes).toBe(6400); expect(b.plays).toBe(320); expect(b.status).toBe("Quote");
    expect(JSON.stringify(b)).not.toContain(input.phone); expect(b).not.toHaveProperty("advertiserId");
    await store.saveSettings(DEFAULT_SETTINGS); expect((await store.publicBooking(b.reference))?.priceKes).toBe(6400);
  });
  it("refuses the smallest order, early starts, bad fields and invoice below 50000", async () => {
    await expect(store.createQuote({ ...input, request: { ...input.request, howOften: 1 } })).rejects.toThrow("smallest");
    await expect(store.createQuote({ ...input, request: { ...input.request, startDate: "2026-10-28" } })).rejects.toThrow("earliest");
    await expect(store.createQuote({ ...input, paysBy: "invoice" })).rejects.toThrow("50,000");
    for (const change of [{ name: "" }, { phone: "abc" }, { email: "bad" }, { website: "spam" }]) await expect(store.createQuote({ ...input, ...change })).rejects.toThrow();
  });
  it("limits canonical phone numbers to 5 Quotes per Nairobi day, including concurrent calls", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => store.createQuote({ ...input, phone: i % 2 ? "+254712345678" : "0712345678" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    await expect(store.createQuote(input)).resolves.toHaveProperty("reference");
  });
  it("saves full Quotes but strictly refuses payment when hours are full", async () => {
    await store.saveSettings({ ...DEFAULT_SETTINGS, secondsForSalePerHour: 100 });
    await paid();
    const b = await store.createQuote({ ...input, phone: "0722222222" });
    expect(b.capacity.ok).toBe(false); expect(b.capacity.fullHours.length).toBeGreaterThan(0); expect(b.capacity.suggestions.length).toBeGreaterThan(0);
    await store.savePaymentNote(b.reference, "INVOICE123");
    await expect(store.move(b.reference, "Paid", "staff@example.test", "")).rejects.toThrow("Space is unavailable");
    expect((await store.bookingDetail(b.reference))?.history).toHaveLength(0);
  });
  it("serialises competing payments", async () => {
    await store.saveSettings({ ...DEFAULT_SETTINGS, secondsForSalePerHour: 100 });
    const a = await store.createQuote(input); const b = await store.createQuote({ ...input, phone: "0722222222" });
    for (const q of [a, b]) await store.savePaymentNote(q.reference, "MPESA123");
    const r = await Promise.allSettled([a, b].map((q) => store.move(q.reference, "Paid", "staff@example.test", "")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("enforces at most 3 adverts, including concurrent uploads", async () => {
    const b = await store.createQuote(input);
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => store.addAdvert(b.reference, file, 10)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    await expect(store.addAdvert(b.reference, file, 10)).rejects.toThrow("At most 3");
    expect((await store.bookingDetail(b.reference))?.adverts[0].filePath).toBe("");
  });
  it("approves an advert without a reason but needs one to refuse", async () => {
    const b = await paid();
    await store.addAdvert(b.reference, file, 10);
    const advert = (await store.bookingDetail(b.reference))!.adverts[0];
    await expect(store.decideAdvert(b.reference, advert.id, "refused", " ")).rejects.toThrow("reason");
    await store.decideAdvert(b.reference, advert.id, "approved", "");
    expect((await store.bookingDetail(b.reference))!.adverts[0].decision).toBe("approved");
  });
  it("accepts only MP4, PNG or JPEG adverts up to 50 MB", async () => {
    const b = await paid();
    await expect(store.addAdvert(b.reference, { ...file, name: "shop.webm", type: "video/webm" }, 10)).rejects.toThrow("MP4");
    await expect(store.addAdvert(b.reference, { ...file, size: 51 * 1024 * 1024 }, 10)).rejects.toThrow("50 MB");
    await store.addAdvert(b.reference, { ...file, size: 50 * 1024 * 1024 }, 10);
    expect((await store.bookingDetail(b.reference))!.adverts).toHaveLength(1);
  });
  it("writes exactly one history row for every move and none for refused moves", async () => {
    const b = await paid();
    await expect(store.move(b.reference, "Approved", "staff@example.test", "")).rejects.toThrow("at least one");
    await store.addAdvert(b.reference, file, 10);
    const advert = (await store.bookingDetail(b.reference))!.adverts[0];
    await store.decideAdvert(b.reference, advert.id, "approved", "Length checked");
    await store.move(b.reference, "Approved", "staff@example.test", "Ready");
    await store.move(b.reference, "Live", "staff@example.test", "Started", "2026-11-02");
    await store.move(b.reference, "Finished", "staff@example.test", "Completed", "2026-11-30");
    const detail = (await store.bookingDetail(b.reference))!;
    expect(detail.history.map((h) => [h.fromStatus, h.toStatus])).toEqual([["Quote", "Paid"], ["Paid", "Approved"], ["Approved", "Live"], ["Live", "Finished"]]);
    expect(detail.history.every((h) => h.staffEmail === "staff@example.test")).toBe(true);
    await expect(store.move(b.reference, "Cancelled", "staff@example.test", "No")).rejects.toThrow("Nothing leaves");
    const c = await store.createQuote({ ...input, phone: "0733333333" });
    await store.move(c.reference, "Cancelled", "staff@example.test", "Client request");
    expect((await store.bookingDetail(c.reference))?.history).toHaveLength(1);
  });
  it("exports only Approved and Live bookings using approved adverts, matching buildSchedule", async () => {
    const a = await paid(); const b = await paid("0722222222"); await paid("0733333333");
    for (const q of [a, b]) {
      await store.addAdvert(q.reference, file, 10); await store.addAdvert(q.reference, { ...file, name: "unused.mp4" }, 10);
      const ad = (await store.bookingDetail(q.reference))!.adverts[0];
      await store.decideAdvert(q.reference, ad.id, "approved", "Checked");
      await store.move(q.reference, "Approved", "staff@example.test", "");
    }
    await store.move(b.reference, "Live", "staff@example.test", "", "2026-11-02");
    const expected = buildSchedule([a, b].map((q) => ({ bookingId: q.reference, request: q.request, adverts: [file.name] })), "2026-11-02", "2026-11-08");
    expect(await store.schedule("2026-11-02", "2026-11-08")).toEqual(expected);
  });
});
describe("settings validation", () => {
  it("accepts defaults and rejects unsorted steps, fractional and non-positive fields", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, discountSteps: [...DEFAULT_SETTINGS.discountSteps].reverse() })).toThrow("Sort");
    for (const field of ["kesPerSecond", "minOrderKes", "secondsForSalePerHour", "maxPlaysPerAdvertiserPerHour", "leadWorkingDays"]) for (const n of [0, -1, 1.5]) expect(() => validateSettings({ ...DEFAULT_SETTINGS, [field]: n })).toThrow("whole");
  });
  it("rejects blocks outside 0 to 24 and invalid holidays", () => {
    for (const startHour of [-1, 1.5, 24]) expect(() => validateSettings({ ...DEFAULT_SETTINGS, timeBlocks: { ...DEFAULT_SETTINGS.timeBlocks, morning: { startHour, endHour: 24, label: "Morning" } } })).toThrow("0 to 24");
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, timeBlocks: { ...DEFAULT_SETTINGS.timeBlocks, late: { startHour: 22, endHour: 25, label: "Late" } } })).toThrow("0 to 24");
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, publicHolidays: ["2026-02-30"] })).toThrow("dates");
  });
});
