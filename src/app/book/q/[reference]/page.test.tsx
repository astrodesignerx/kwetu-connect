import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicBooking } from "../../../../lib/store/types";
import { DEFAULT_SETTINGS } from "../../../../lib/booking/settings";

const mocks = vi.hoisted(() => ({ publicBooking: vi.fn() }));
vi.mock("@/lib/store", () => ({ getStore: () => ({ publicBooking: mocks.publicBooking, getSettings: async () => DEFAULT_SETTINGS }) }));
vi.mock("@/lib/contact", () => ({ WHATSAPP_NUMBER: "254729911021", MPESA_PAYBILL: "" }));
vi.mock("@/lib/booking-mail", () => ({ bookingUrl: (origin: string, ref: string) => `${origin}/book/q/${ref}`, siteOrigin: async () => "https://example.test" }));
vi.mock("@/components/booking/BookingSummary", () => ({ CapacityNotice: () => null }));
vi.mock("@/components/booking/PayPanel", async () => import("../../../../components/booking/PayPanel"));
vi.mock("@/components/booking/BookingProgress", () => ({ default: () => null }));
vi.mock("@/components/booking/SavedBookings", () => ({ KeepLink: () => null, RememberBooking: () => null }));
vi.mock("@/components/booking/QuoteDetails", () => ({ WeekStrip: () => null }));
vi.mock("@/lib/booking/answers", () => ({ buildQuery: () => "" }));
vi.mock("@/components/manage/StatusTag", () => ({ default: () => null }));
vi.mock("@/components/workspace/BookHeader", () => ({ default: () => null }));
vi.mock("@/lib/booking/selection", async () => import("../../../../lib/booking/selection"));
vi.mock("../../actions", () => ({ replaceAdvert: vi.fn() }));
import QuotePage from "./page";

let booking: PublicBooking;
beforeEach(() => {
  booking = {
    reference: "KCA-0123456789ABCDEF", status: "Quote", priceKes: 3200, fullPriceKes: 3200,
    discountPercent: 0, plays: 320, createdAt: "2026-10-27T10:00:00Z", adverts: 0,
    advertState: "none", steps: [], capacity: { ok: true, fullHours: [], suggestions: [], largestHowOftenThatFits: null },
    request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning"], startDate: "2026-11-02", endDate: "2026-11-29" },
  };
  mocks.publicBooking.mockImplementation(async () => booking);
});
async function html() {
  return renderToStaticMarkup(await QuotePage({ params: Promise.resolve({ reference: booking.reference }), searchParams: Promise.resolve({}) }));
}

describe("public advert controls", () => {
  it("puts the notice under the amount and before payment choices for a Quote", async () => {
    const markup = await html();
    const notice = markup.indexOf("KCA checks every advert before it plays.");
    expect(notice).toBeGreaterThan(markup.indexOf("AMOUNT DUE"));
    expect(notice).toBeLessThan(markup.indexOf("How you pay"));
    expect(markup).toContain("Refunds apply only if we cannot run your advert.");
    expect(markup).toContain("not sent yet");
    expect(markup).not.toContain('name="advert"');
  });
  it("renders the escaped refusal reason and a replacement form with the booked length", async () => {
    booking = { ...booking, status: "Paid", adverts: 1, advertState: "refused", refusedReason: "Use <larger> text." };
    const markup = await html();
    expect(markup).toContain("KCA asked for changes to your advert");
    expect(markup).toContain("Use &lt;larger&gt; text.");
    expect(markup).toContain('name="advert"');
    expect(markup).toContain('accept="video/mp4,image/png,image/jpeg"');
    expect(markup).toMatch(/name="advertSeconds"[^>]*value="10"/);
    expect(markup).toContain("changes needed");
    expect(markup).toContain("Ask KCA on WhatsApp");
    for (const privateField of ["fileName", "filePath", "bookingId", "staffEmail"]) expect(markup).not.toContain(privateField);
  });
  it("offers an upload for a paid booking without an advert", async () => {
    booking.status = "Paid";
    expect(await html()).toContain("Send your advert");
    expect(await html()).toContain('name="advert"');
  });
  it.each(["approved", "waiting"] as const)("shows %s without an upload form", async (advertState) => {
    booking = { ...booking, status: "Paid", adverts: 1, advertState };
    const markup = await html();
    expect(markup).not.toContain('name="advert"');
    expect(markup).toContain(advertState === "approved" ? "approved" : "waiting for KCA check");
  });
});
