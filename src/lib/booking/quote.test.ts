import { describe, expect, it } from "vitest";
import { bookedHours, earliestStartDate, type BookingRequest } from "./hours";
import { quote } from "./quote";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

const smallShop: BookingRequest = {
  lengthSeconds: 10,
  howOften: 10,
  days: [6],
  blocks: ["morning", "midday"],
  startDate: "2026-11-02",
  endDate: "2026-11-29",
};

const growingBusiness: BookingRequest = {
  lengthSeconds: 15,
  howOften: 10,
  days: [5, 6, 0],
  blocks: ["morning", "midday", "afternoon", "evening", "late"],
  startDate: "2026-11-02",
  endDate: "2026-11-15",
};

const largeOrganisation: BookingRequest = {
  lengthSeconds: 15,
  howOften: 10,
  days: [0, 1, 2, 3, 4, 5, 6],
  blocks: ["morning", "midday", "afternoon", "evening", "late"],
  startDate: "2026-11-02",
  endDate: "2027-01-24",
};

function oneHourRequest(howOften: number, lengthSeconds = 5): BookingRequest {
  return {
    lengthSeconds,
    howOften,
    days: [1],
    blocks: ["morning"],
    startDate: "2026-11-02",
    endDate: "2026-11-02",
  };
}

function settingsWithHowOften(plays: number): BookingSettings {
  return {
    ...DEFAULT_SETTINGS,
    howOften: [{ plays, label: "Test" }],
    timeBlocks: {
      ...DEFAULT_SETTINGS.timeBlocks,
      morning: { startHour: 6, endHour: 7, label: "Morning" },
    },
  };
}

describe("bookedHours", () => {
  it("counts Saturday morning and midday hours for the small shop", () => {
    const hours = bookedHours(smallShop);
    expect(hours).toHaveLength(32);
    expect(hours[0]).toBe("2026-11-07T06");
    expect(hours[hours.length - 1]).toBe("2026-11-28T13");
  });

  it("counts 118 hours in a week with every day and every block", () => {
    const hours = bookedHours({
      ...smallShop,
      days: [0, 1, 2, 3, 4, 5, 6],
      blocks: ["morning", "midday", "afternoon", "evening", "late"],
      startDate: "2026-11-02",
      endDate: "2026-11-08",
    });
    expect(hours).toHaveLength(118);
  });

  it("adds no late hours on Monday to Thursday", () => {
    const hours = bookedHours({
      ...smallShop,
      days: [1, 2, 3, 4],
      blocks: ["late"],
      startDate: "2026-11-02",
      endDate: "2026-11-05",
    });
    expect(hours).toHaveLength(0);
  });

  it("adds late hours on Friday to Sunday", () => {
    const hours = bookedHours({
      ...smallShop,
      days: [5, 6, 0],
      blocks: ["late"],
      startDate: "2026-11-06",
      endDate: "2026-11-08",
    });
    expect(hours).toHaveLength(6);
  });
});

describe("quote", () => {
  it("prices the small shop example", () => {
    const result = quote(smallShop);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hoursBooked).toBe(32);
    expect(result.plays).toBe(320);
    expect(result.fullPriceKes).toBe(3200);
    expect(result.discountPercent).toBe(0);
    expect(result.priceKes).toBe(3200);
    expect(result.belowMinimum).toBe(false);
  });

  it("prices the growing business example", () => {
    const result = quote(growingBusiness);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plays).toBe(1080);
    expect(result.fullPriceKes).toBe(16200);
    expect(result.discountPercent).toBe(10);
    expect(result.priceKes).toBe(14580);
  });

  it("prices the large organisation example", () => {
    const result = quote(largeOrganisation);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plays).toBe(14160);
    expect(result.discountPercent).toBe(30);
    expect(result.priceKes).toBe(148680);
    expect(result.nextStep).toBeNull();
  });

  it.each([
    [999, 0],
    [1000, 10],
    [4999, 10],
    [5000, 20],
    [9999, 20],
    [10000, 30],
  ])("applies the right discount at %i plays", (plays, percent) => {
    const result = quote(
      oneHourRequest(plays),
      settingsWithHowOften(plays)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plays).toBe(plays);
    expect(result.discountPercent).toBe(percent);
  });

  it("rounds the price down", () => {
    const plays = 1001;
    const result = quote(
      oneHourRequest(plays),
      settingsWithHowOften(plays)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fullPriceKes).toBe(5005);
    expect(result.priceKes).toBe(4504);
  });

  it("marks an order below the minimum", () => {
    const plays = 299;
    const result = quote(
      oneHourRequest(plays, 10),
      settingsWithHowOften(plays)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.priceKes).toBe(2990);
    expect(result.belowMinimum).toBe(true);
  });

  it("returns errors for an unavailable length", () => {
    const result = quote({ ...smallShop, lengthSeconds: 7 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("That length is not available.");
  });

  it("returns errors for an unavailable how often choice", () => {
    const result = quote({ ...smallShop, howOften: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("That how often choice is not available.");
  });

  it("returns errors for an end date before the start date", () => {
    const result = quote({
      ...smallShop,
      startDate: "2026-11-29",
      endDate: "2026-11-02",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("The end date is before the start date.");
  });

  it("returns errors when no hours are booked", () => {
    const result = quote({
      ...smallShop,
      days: [1],
      blocks: ["late"],
      startDate: "2026-11-02",
      endDate: "2026-11-02",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain(
      "No screen hours are booked with these choices."
    );
  });
});

describe("earliestStartDate", () => {
  it("moves from Monday to Wednesday", () => {
    expect(earliestStartDate("2026-11-02")).toBe("2026-11-04");
  });

  it("moves from Friday to Tuesday", () => {
    expect(earliestStartDate("2026-11-06")).toBe("2026-11-10");
  });

  it("moves from Saturday to Tuesday", () => {
    expect(earliestStartDate("2026-11-07")).toBe("2026-11-10");
  });

  it("skips a public holiday", () => {
    const settings: BookingSettings = {
      ...DEFAULT_SETTINGS,
      publicHolidays: ["2026-11-04"],
    };
    expect(earliestStartDate("2026-11-02", settings)).toBe("2026-11-05");
  });
});
