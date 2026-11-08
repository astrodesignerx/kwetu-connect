import { afterEach, describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "../booking/hours";
import { checkCapacity } from "../booking/capacity";
import { occupancyByDayBlock } from "../booking/occupancy";
import { DEFAULT_SETTINGS } from "../booking/settings";
import { weekSold } from "../dashboard";
import { demoData } from "./demo";
import { MemoryStore } from "./memory";
import { todayInNairobi } from "./validation";

describe("demo data", () => {
  afterEach(() => { delete process.env.KCA_DEMO_DATA; });
  it("sells about 79% of the week on any day of the week, with no hour over capacity", () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = addDays("2026-11-02", offset);
      const data = demoData(today);
      const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
      const sold = weekSold(occupancyByDayBlock(data.bookings, monday, addDays(monday, 6), DEFAULT_SETTINGS), DEFAULT_SETTINGS);
      expect(sold).toBeGreaterThan(0.785);
      expect(sold).toBeLessThan(0.795);
      for (const booking of data.bookings.filter((b) => ["Paid", "Approved", "Live"].includes(b.status))) {
        expect(checkCapacity(booking.request, booking.advertiserId, data.bookings.filter((b) => b.id !== booking.id), DEFAULT_SETTINGS).ok, booking.reference).toBe(true);
      }
    }
  });
  it("month70 sells about 70% of the calendar month and of every week in it, with no hour over capacity", () => {
    for (const today of ["2026-11-01", "2026-11-08", "2026-11-19", "2026-11-30", "2027-02-14"]) {
      const data = demoData(today, "month70");
      const first = today.slice(0, 8) + "01";
      const last = addDays(addDays(first, 31).slice(0, 8) + "01", -1);
      const month = weekSold(occupancyByDayBlock(data.bookings, first, last, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
      expect(month, today).toBeGreaterThan(0.695);
      expect(month, today).toBeLessThan(0.72);
      for (let monday = addDays(first, -((weekdayOf(first) + 6) % 7)); monday <= last; monday = addDays(monday, 7)) {
        const week = weekSold(occupancyByDayBlock(data.bookings, monday, addDays(monday, 6), DEFAULT_SETTINGS), DEFAULT_SETTINGS);
        expect(week, monday).toBeGreaterThan(0.695);
        expect(week, monday).toBeLessThan(0.725);
      }
      for (const booking of data.bookings.filter((b) => ["Paid", "Approved", "Live"].includes(b.status))) {
        expect(checkCapacity(booking.request, booking.advertiserId, data.bookings.filter((b) => b.id !== booking.id), DEFAULT_SETTINGS).ok, booking.reference).toBe(true);
      }
    }
  });
  it("loads only with KCA_DEMO_DATA=1 and gives the manager a working playlist", async () => {
    expect(await new MemoryStore().listBookings()).toHaveLength(0);
    process.env.KCA_DEMO_DATA = "1";
    const store = new MemoryStore();
    expect((await store.listBookings()).length).toBeGreaterThan(15);
    const today = todayInNairobi();
    await expect(store.schedule(today, today)).resolves.toBeTruthy();
  });
});
