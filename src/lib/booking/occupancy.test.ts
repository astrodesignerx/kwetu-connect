import { describe, expect, it } from "vitest";
import { occupancyByDayBlock } from "./occupancy";
import { DEFAULT_SETTINGS } from "./settings";
import type { ExistingBooking } from "./capacity";

const booking = (status: ExistingBooking["status"] = "Paid"): ExistingBooking => ({
  id: "private-reference", advertiserId: "private-contact", status,
  request: { lengthSeconds: 30, howOften: 20, days: [1], blocks: ["morning"], startDate: "2026-11-02", endDate: "2026-11-02" },
});
describe("occupancyByDayBlock", () => {
  it("marks late Monday to Thursday closed and the weekend open", () => {
    const grid = occupancyByDayBlock([], "2026-11-02", "2026-11-08");
    for (const day of [1, 2, 3, 4]) expect(grid[day].late).toEqual({ open: false, soldShare: 0 });
    for (const day of [5, 6, 0]) expect(grid[day].late).toEqual({ open: true, soldShare: 0 });
  });
  it("shows no sold time in an empty week", () => {
    const grid = occupancyByDayBlock([], "2026-11-02", "2026-11-08");
    expect(Object.values(grid).flatMap(Object.values).every((c) => c.soldShare === 0)).toBe(true);
    expect(grid[1].morning.open).toBe(true);
  });
  it("divides sold seconds by all matching screen hours in the range", () => {
    const grid = occupancyByDayBlock([booking()], "2026-11-02", "2026-11-15");
    expect(grid[1].morning.soldShare).toBe((4 * 600) / (8 * 2700));
    expect(grid[2].morning.soldShare).toBe(0);
  });
  it.each(["Paid", "Approved", "Live"] as const)("counts %s bookings", (status) => {
    expect(occupancyByDayBlock([booking(status)], "2026-11-02", "2026-11-08")[1].morning.soldShare).toBe(600 / 2700);
  });
  it("ignores quotes, finished and cancelled bookings and does not expose their data", () => {
    const grid = occupancyByDayBlock([booking("Quote"), booking("Finished"), booking("Cancelled")], "2026-11-02", "2026-11-08");
    expect(grid[1].morning.soldShare).toBe(0);
    expect(JSON.stringify(grid)).not.toContain("private");
    expect(Object.keys(grid[1].morning)).toEqual(["open", "soldShare"]);
  });
  it("clips bookings and blocks to the requested dates and configured screen hours", () => {
    const settings = { ...DEFAULT_SETTINGS, screenHours: { ...DEFAULT_SETTINGS.screenHours, 1: { open: 8, close: 9 } } };
    expect(occupancyByDayBlock([booking()], "2026-11-02", "2026-11-02", settings)[1].morning.soldShare).toBe(600 / 2700);
    const outside = occupancyByDayBlock([booking()], "2026-11-09", "2026-11-09", settings);
    expect(outside[1].morning).toEqual({ open: true, soldShare: 0 });
    expect(outside[2].morning.open).toBe(false);
  });
});
