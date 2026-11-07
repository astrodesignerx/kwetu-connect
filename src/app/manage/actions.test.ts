import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../lib/store/memory";
import type { QuoteInput } from "../../lib/store/types";

const mocks = vi.hoisted(() => ({ getStore: vi.fn(), requireStaff: vi.fn(), sendBookingMail: vi.fn(), siteOrigin: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: mocks.getStore }));
vi.mock("@/lib/store/validation", async () => import("../../lib/store/validation"));
vi.mock("@/lib/auth/server", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/booking-mail", () => ({ sendBookingMail: mocks.sendBookingMail, siteOrigin: mocks.siteOrigin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { decideAdvert } from "./actions";

const input: QuoteInput = { name: "Amina", phone: "0712345678", email: "customer@example.test", business: "Shop", paysBy: "now", request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-02", endDate: "2026-11-29" } };
let store: MemoryStore;
let form: FormData;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  store = new MemoryStore(); mocks.getStore.mockReturnValue(store);
  mocks.requireStaff.mockResolvedValue({ email: "staff@example.test" });
  mocks.siteOrigin.mockResolvedValue("https://example.test");
  mocks.sendBookingMail.mockResolvedValue(undefined);
  const b = await store.createQuote(input);
  await store.addAdvert(b.reference, { name: "shop.png", type: "image/png", size: 10, arrayBuffer: async () => new ArrayBuffer(10) }, 10);
  const advert = (await store.bookingDetail(b.reference))!.adverts[0];
  form = new FormData();
  for (const [key, value] of Object.entries({ reference: b.reference, id: advert.id, decision: "refused", reason: "Use larger text." })) form.set(key, value);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("staff refusal", () => {
  it("emails the stored advertiser only after the refusal is saved", async () => {
    mocks.sendBookingMail.mockImplementation(async () => {
      expect((await store.publicBooking(String(form.get("reference"))))?.advertState).toBe("refused");
    });
    expect(await decideAdvert({ message: "" }, form)).toEqual({ message: "Saved." });
    expect(mocks.requireStaff).toHaveBeenCalled();
    expect(mocks.sendBookingMail).toHaveBeenCalledWith("refused", input.email, input.name, [expect.objectContaining({ advertState: "refused" })], "https://example.test", "Use larger text.");
  });
  it("preserves a successful refusal even when sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendBookingMail.mockRejectedValue(new Error("Mail unavailable"));
    expect(await decideAdvert({ message: "" }, form)).toEqual({ message: "Saved." });
    expect((await store.publicBooking(String(form.get("reference"))))?.advertState).toBe("refused");
  });
  it("does not email failed decisions, approvals or advertisers without an email", async () => {
    form.set("reason", "");
    expect((await decideAdvert({ message: "" }, form)).message).toContain("reason");
    expect(mocks.sendBookingMail).not.toHaveBeenCalled();
    form.set("decision", "approved");
    expect(await decideAdvert({ message: "" }, form)).toEqual({ message: "Saved." });
    expect(mocks.sendBookingMail).not.toHaveBeenCalled();
    const detail = (await store.bookingDetail(String(form.get("reference"))))!;
    vi.spyOn(store, "bookingDetail").mockResolvedValue({ ...detail, advertiser: { ...detail.advertiser, email: "" } });
    form.set("decision", "refused"); form.set("reason", "Needs changes.");
    expect(await decideAdvert({ message: "" }, form)).toEqual({ message: "Saved." });
    expect(mocks.sendBookingMail).not.toHaveBeenCalled();
  });
});
