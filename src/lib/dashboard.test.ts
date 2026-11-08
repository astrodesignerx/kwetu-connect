import { describe, expect, it } from "vitest";
import { blockShares, currentPlaylist, hourShares, nairobiClock, onAirStatus, weeklyTotals, weekSold } from "./dashboard";
import { DEFAULT_SETTINGS } from "./booking/settings";
import { occupancyByDayBlock } from "./booking/occupancy";
import type { BookingListItem } from "./store/types";
import type { Schedule } from "./booking/playlist";

function booking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return { id: "one", advertiserId: "advertiser", reference: "KCA-TEST", business: "Test business", status: "Paid", plays: 320, fullPriceKes: 3200, discountPercent: 0, priceKes: 3200, paymentNote: "", createdAt: "2026-11-03T08:00:00Z", updatedAt: "2026-11-03T08:00:00Z", request: { lengthSeconds: 10, howOften: 10, days: [2], blocks: ["morning"], startDate: "2026-11-03", endDate: "2026-11-03" }, ...overrides };
}
describe("screen on-air status", () => {
  it("uses Nairobi time across UTC date boundaries", () => { expect(nairobiClock(new Date("2026-11-02T22:30:10Z"))).toEqual({ date: "2026-11-03", hour: 1, second: 1810 }); });
  it("opens exactly at the settings hour", () => { expect(onAirStatus(DEFAULT_SETTINGS, new Date("2026-11-03T03:00:00Z")).onAir).toBe(true); });
  it("closes at the exclusive closing boundary", () => { expect(onAirStatus(DEFAULT_SETTINGS, new Date("2026-11-03T19:00:00Z"))).toEqual({ onAir: false, label: "Screen off air, back at 06:00 tomorrow" }); });
  it("uses custom opening hours, not fixed copy", () => { const settings = { ...DEFAULT_SETTINGS, screenHours: { 2: { open: 9, close: 14 } } }; expect(onAirStatus(settings, new Date("2026-11-03T04:00:00Z")).label).toBe("Screen off air, back at 09:00"); });
  it("handles midnight closing as 24:00", () => { expect(onAirStatus(DEFAULT_SETTINGS, new Date("2026-11-06T20:59:59Z")).onAir).toBe(true); expect(onAirStatus(DEFAULT_SETTINGS, new Date("2026-11-06T21:00:00Z")).onAir).toBe(false); });
  it("handles an entirely closed screen", () => { expect(onAirStatus({ ...DEFAULT_SETTINGS, screenHours: {} }, new Date("2026-11-03T08:00:00Z")).label).toBe("Screen off air, hours not set"); });
});
describe("sold shares by time block", () => {
  const day = (hours: { hour: number; share: number; closed?: boolean }[]) => ({ date: "2026-11-03", label: "Tue", hours });
  it("averages only the open hours inside each block", () => { const [morning] = blockShares([day([{ hour: 6, share: .2 }, { hour: 7, share: .4 }, { hour: 8, share: 1, closed: true }, { hour: 10, share: 1 }])], DEFAULT_SETTINGS); expect(morning.id).toBe("morning"); expect(morning.cells[0].share).toBeCloseTo(.3); });
  it("marks a block closed on a day with no open hours", () => { const rows = blockShares([day([{ hour: 6, share: .5 }]), { ...day([]), date: "2026-11-04", label: "Wed" }], DEFAULT_SETTINGS); expect(rows[0].cells.map((cell) => cell.share)).toEqual([.5, null]); });
  it("keeps a fully unsold block at zero, not closed", () => { expect(blockShares([day([{ hour: 18, share: 0 }])], DEFAULT_SETTINGS)[0].cells[0].share).toBe(0); });
  it("leaves out blocks closed all week and keeps block order", () => { expect(blockShares([day([{ hour: 22, share: .1 }, { hour: 6, share: .1 }])], DEFAULT_SETTINGS).map((block) => block.id)).toEqual(["morning", "late"]); });
});
describe("weekly totals", () => {
  it("returns seven real weeks including zero totals", () => { const totals = weeklyTotals([booking()], "2026-11-02"); expect(totals).toHaveLength(7); expect(totals[0]).toEqual({ from: "2026-09-21", count: 0, kes: 0 }); expect(totals[6]).toEqual({ from: "2026-11-02", count: 1, kes: 3200 }); });
  it("excludes cancelled and future-created bookings", () => { const totals = weeklyTotals([booking({ status: "Cancelled" }), booking({ createdAt: "2026-11-09T00:00:00Z" })], "2026-11-02"); expect(totals[6].kes).toBe(0); });
  it("counts created dates in Nairobi, not UTC or campaign start", () => { const totals = weeklyTotals([booking({ createdAt: "2026-11-01T22:00:00Z" })], "2026-11-02"); expect(totals[6].count).toBe(1); expect(totals[5].count).toBe(0); });
  it("adds stored totals without recalculating historic prices", () => { expect(weeklyTotals([booking({ priceKes: 4567 }), booking({ priceKes: 9012 })], "2026-11-02")[6].kes).toBe(13579); });
});
describe("hour-by-hour sold shares", () => {
  it("uses the settings denominator and chosen time blocks", () => { const hours = hourShares([booking()], "2026-11-03", DEFAULT_SETTINGS); expect(hours).toHaveLength(16); expect(hours[0].share).toBeCloseTo(100 / 2700); expect(hours.find((entry) => entry.hour === 10)?.share).toBe(0); });
  it("counts Paid, Approved and Live only", () => { const states = ["Quote", "Paid", "Approved", "Live", "Finished", "Cancelled"] as const; expect(hourShares(states.map((status) => booking({ status })), "2026-11-03", DEFAULT_SETTINGS)[0].share).toBeCloseTo(300 / 2700); });
  it("excludes wrong dates and unselected weekdays", () => { expect(hourShares([booking()], "2026-11-04", DEFAULT_SETTINGS).every((entry) => entry.share === 0)).toBe(true); });
  it("supports a closed day", () => { expect(hourShares([], "2026-11-03", { ...DEFAULT_SETTINGS, screenHours: {} })).toEqual([]); });
  it("uses a changed sale capacity", () => { expect(hourShares([booking()], "2026-11-03", { ...DEFAULT_SETTINGS, secondsForSalePerHour: 1000 })[0].share).toBe(.1); });
});
describe("weighted week share", () => {
  it("weights open hours rather than averaging closed cells", () => { const entry = booking(); const occupancy = occupancyByDayBlock([entry], "2026-11-02", "2026-11-08", DEFAULT_SETTINGS); expect(weekSold(occupancy, DEFAULT_SETTINGS)).toBeCloseTo(400 / (118 * 2700)); });
  it("returns zero with no open hours", () => { expect(weekSold(occupancyByDayBlock([], "2026-11-02", "2026-11-08"), { ...DEFAULT_SETTINGS, screenHours: {} })).toBe(0); });
});
describe("scheduled playback", () => {
  const schedule: Schedule = { playlistsCsv: "", scheduleCsv: "", rows: [{ playlist: "one", startDate: "2026-11-03", endDate: "2026-11-03", startHour: 6, endHour: 10 }], playlists: [{ name: "one", items: [{ kind: "advert", bookingId: "KCA-TEST", advert: "test.mp4", start: 0, seconds: 10 }, { kind: "kca", start: 10, seconds: 3590 }] }] };
  it("selects exact item boundaries from the built schedule", () => { expect(currentPlaylist(schedule, "2026-11-03", 6, 9).current?.kind).toBe("advert"); expect(currentPlaylist(schedule, "2026-11-03", 6, 10).current?.kind).toBe("kca"); });
  it("wraps the next item at the end of a playlist", () => { expect(currentPlaylist(schedule, "2026-11-03", 6, 3599).next?.kind).toBe("advert"); });
  it("does not infer an item outside the scheduled hours", () => { expect(currentPlaylist(schedule, "2026-11-03", 10, 0)).toEqual({ current: null, next: null }); });
});
