import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/booking/settings";
import type { Advert, Booking, MailDirectory } from "@/lib/store/types";
import BookingHero from "./BookingHero";

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "b1", advertiserId: "a1", reference: "KCA-TEST0001", status: "Paid", plays: 840, fullPriceKes: 3200, discountPercent: 0, priceKes: 3200,
  paymentNote: "", createdAt: "2026-11-20T08:00:00Z", updatedAt: "2026-11-20T08:00:00Z",
  request: { lengthSeconds: 10, howOften: 6, days: [6], blocks: ["midday"], startDate: "2026-12-05", endDate: "2026-12-19" }, ...over,
} as Booking);
const directory = (b: Booking, adverts: Advert[] = []): MailDirectory => ({
  advertisers: [{ id: "a1", name: "Agnes Jeptoo", phone: "254700000116", email: "agnes@example.com", business: "Nandi Hills Tea Room", paysBy: "now", createdAt: "2026-11-20T08:00:00Z" }],
  bookings: [b], adverts, settings: DEFAULT_SETTINGS,
});
const render = (b: Booking, adverts: Advert[] = []) => renderToStaticMarkup(<BookingHero booking={b} client={null} data={directory(b, adverts)} today="2026-12-10" />);
const advert = (over: Partial<Advert> = {}): Advert => ({ id: "ad1", bookingId: "b1", filePath: "", fileName: "tea.mp4", seconds: 10, decision: "waiting", reason: "", createdAt: "2026-11-21T08:00:00Z", ...over });

describe("Booking card", () => {
  it("marks earlier steps done and the current one as now", () => {
    const html = render(booking({ status: "Approved" }));
    expect(html.match(/data-step="done"/g)).toHaveLength(2);
    expect(html).toContain('data-step="now" aria-current="step"><i></i>Advert approved');
    expect(html.match(/data-step="next"/g)).toHaveLength(2);
  });

  it("names the business, price, screen, dates and plan from the booking", () => {
    const html = render(booking());
    expect(html).toContain("Nandi Hills Tea Room");
    expect(html).toContain("3,200");
    expect(html).toContain("Kisumu Ndogo Road");
    expect(html).toContain("10 s, 6 plays an hour");
    expect(html).toContain('href="/manage/bookings/KCA-TEST0001"');
  });

  it("shows run progress and the on air badge only while live", () => {
    expect(render(booking())).not.toContain("On air</span>");
    const live = render(booking({ status: "Live" }));
    expect(live).toContain("bk-onair");
    expect(live).toContain("Day 6 of 15");
  });

  it("shows Cancelled instead of steps for a cancelled booking", () => {
    const html = render(booking({ status: "Cancelled" }));
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("bk-steps");
  });

  it("points the next step at the advert desk while an advert waits", () => {
    expect(render(booking(), [advert()])).toContain('href="/manage/adverts?q=KCA-TEST0001"');
    expect(render(booking({ status: "Quote" }))).toContain("Confirm payment");
  });

  it("shows an uploaded picture advert, and a placeholder for video or no file", () => {
    expect(render(booking(), [advert({ filePath: "adverts/tea.png", fileName: "tea.png" })])).toContain("/manage/bookings/KCA-TEST0001/advert/ad1");
    const video = render(booking(), [advert({ filePath: "adverts/tea.mp4" })]);
    expect(video).not.toContain("/advert/ad1");
    expect(video).toContain("Advert waiting for review");
    expect(render(booking())).toContain("No advert yet");
  });
});
