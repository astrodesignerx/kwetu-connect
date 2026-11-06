import { describe, expect, it } from "vitest";
import { scheduleCells } from "./manager-schedule";
import { DEFAULT_SETTINGS } from "./booking/settings";
import { MemoryStore } from "./store/memory";
import type { Schedule } from "./booking/playlist";

const schedule: Schedule = {
  rows: [{ playlist: "one", startDate: "2026-11-03", endDate: "2026-11-03", startHour: 6, endHour: 8 }],
  playlists: [{ name: "one", items: [{ kind: "advert", bookingId: "KCA-ONE", advert: "one.mp4", start: 0, seconds: 10 }, { kind: "advert", bookingId: "KCA-ONE", advert: "two.mp4", start: 10, seconds: 10 }, { kind: "kca", start: 20, seconds: 3580 }] }],
  playlistsCsv: "", scheduleCsv: "",
};

describe("manager schedule visual", () => {
  it("uses actual playlist seconds and averages only over open block hours", () => {
    const cell = scheduleCells(schedule, [], DEFAULT_SETTINGS, "2026-11-03", "2026-11-03")[0];
    expect(cell.bookings).toHaveLength(1);
    expect(cell.bookings[0].reference).toBe("KCA-ONE");
    expect(cell.share).toBeCloseTo(40 / (4 * DEFAULT_SETTINGS.secondsForSalePerHour));
  });
  it("clips to custom screen hours and marks closed blocks without dividing by zero", () => {
    const cells = scheduleCells(schedule, [], { ...DEFAULT_SETTINGS, screenHours: { 2: { open: 7, close: 9 } } }, "2026-11-03", "2026-11-03");
    expect(cells[0].share).toBeCloseTo(20 / (2 * DEFAULT_SETTINGS.secondsForSalePerHour));
    expect(cells[1].start).toBe(cells[1].end);
    expect(cells[1].share).toBe(0);
  });
  it("never infers a booking from a playlist outside its date or hour rows", () => {
    const cells = scheduleCells(schedule, [], DEFAULT_SETTINGS, "2026-11-04", "2026-11-04");
    expect(cells.every((cell) => cell.bookings.length === 0 && cell.share === 0)).toBe(true);
  });
  it("agrees with generated schedules and excludes Paid and Quote bookings", async () => {
    const previous = process.env.KCA_DEMO_DATA;
    process.env.KCA_DEMO_DATA = "1";
    try {
      const store = new MemoryStore();
      const bookings = await store.listBookings();
      const from = bookings.find((booking) => booking.status === "Live")!.request.startDate;
      const built = await store.schedule(from, from);
      const cells = scheduleCells(built, bookings, DEFAULT_SETTINGS, from, from);
      const shown = new Set(cells.flatMap((cell) => cell.bookings.map((booking) => booking.reference)));
      expect([...shown].length).toBeGreaterThan(0);
      expect(bookings.filter((booking) => shown.has(booking.reference)).every((booking) => ["Approved", "Live"].includes(booking.status))).toBe(true);
      expect(cells.every((cell) => cell.share >= 0 && cell.share <= 1)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.KCA_DEMO_DATA;
      else process.env.KCA_DEMO_DATA = previous;
    }
  });
});
