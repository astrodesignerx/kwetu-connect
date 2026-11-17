import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../lib/store/memory";
import type { PublicBooking, QuoteInput } from "../../lib/store/types";

const mocks = vi.hoisted(() => ({ getStore: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: mocks.getStore }));
vi.mock("@/lib/store/validation", async () => import("../../lib/store/validation"));
vi.mock("@/lib/booking-mail", () => ({ sendBookingMail: vi.fn(), siteOrigin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { replaceAdvert } from "./actions";

const input: QuoteInput = { name: "Amina", phone: "0712345678", business: "Shop", paysBy: "now", request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-02", endDate: "2026-11-29" } };
let store: MemoryStore;
let booking: PublicBooking;
function form() {
  const data = new FormData();
  data.set("reference", booking.reference);
  data.set("advert", new File(["image data"], "new advert?.png", { type: "image/png" }));
  data.set("advertSeconds", "10");
  return data;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  store = new MemoryStore();
  mocks.getStore.mockReturnValue(store);
  booking = await store.createQuote(input);
});
afterEach(() => vi.useRealTimers());

describe("customer advert replacement", () => {
  it("adds a waiting replacement with a safe name while preserving a paid booking", async () => {
    await store.savePaymentNote(booking.reference, "MPESA123");
    await store.move(booking.reference, "Paid", "staff@example.test", "");
    await store.addAdvert(booking.reference, { name: "old.png", type: "image/png", size: 10, arrayBuffer: async () => new ArrayBuffer(10) }, 10);
    const original = (await store.bookingDetail(booking.reference))!.adverts[0];
    await store.decideAdvert(booking.reference, original.id, "refused", "Larger text please.");
    const before = (await store.bookingDetail(booking.reference))!;
    await expect(replaceAdvert(form())).rejects.toThrow(`redirect:/book/q/${booking.reference}?advert=sent`);
    const after = (await store.bookingDetail(booking.reference))!;
    expect(after.booking).toEqual(before.booking);
    expect(after.history).toEqual(before.history);
    expect(after.adverts[1]).toMatchObject({ fileName: "new advert-.png", decision: "waiting", seconds: 10 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/manage", "layout");
  });
  it.each(["Quote", "Paid", "Approved"] as const)("allows an absent advert for %s", async (status) => {
    const lookup = vi.spyOn(store, "publicBooking");
    lookup.mockResolvedValue({ ...booking, status, advertState: "none" });
    await expect(replaceAdvert(form())).rejects.toThrow("?advert=sent");
    expect((await store.bookingDetail(booking.reference))!.adverts).toHaveLength(1);
  });
  it.each([
    ["Quote", "waiting"], ["Paid", "approved"], ["Approved", "approved"],
    ["Live", "refused"], ["Finished", "none"], ["Cancelled", "refused"],
  ] as const)("rejects %s with advert state %s on the server", async (status, advertState) => {
    vi.spyOn(store, "publicBooking").mockResolvedValue({ ...booking, status, advertState });
    const add = vi.spyOn(store, "addAdvert");
    await expect(replaceAdvert(form())).rejects.toThrow("?advert=failed");
    expect(add).not.toHaveBeenCalled();
  });
  it("handles unknown bookings, absent files and failed storage without changing the booking", async () => {
    const before = await store.bookingDetail(booking.reference);
    const absent = form(); absent.delete("advert");
    await expect(replaceAdvert(absent)).rejects.toThrow("?advert=failed");
    const unknown = form(); unknown.set("reference", "unknown");
    await expect(replaceAdvert(unknown)).rejects.toThrow("?advert=failed");
    vi.spyOn(store, "addAdvert").mockRejectedValue(new Error("Storage unavailable"));
    await expect(replaceAdvert(form())).rejects.toThrow("?advert=failed");
    expect(await store.bookingDetail(booking.reference)).toEqual(before);
  });
});
