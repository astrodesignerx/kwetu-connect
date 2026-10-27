import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("opens for 118 hours in a normal week", () => {
    const weeklyHours = Object.values(DEFAULT_SETTINGS.screenHours).reduce(
      (total, hours) => total + (hours.close - hours.open),
      0
    );
    expect(weeklyHours).toBe(118);
  });

  it("keeps the discount steps in descending order", () => {
    expect(DEFAULT_SETTINGS.discountSteps).toEqual([
      { minPlays: 10000, percent: 30 },
      { minPlays: 5000, percent: 20 },
      { minPlays: 1000, percent: 10 },
    ]);
  });

  it("labels every how often choice", () => {
    expect(DEFAULT_SETTINGS.howOften.map((option) => option.label)).toEqual([
      "Once an hour",
      "Every 30 minutes",
      "Every 15 minutes",
      "Every 10 minutes",
      "Every 6 minutes",
      "Every 3 minutes",
    ]);
  });

  it("keeps 900 seconds of every hour as KCA time", () => {
    expect(DEFAULT_SETTINGS.secondsForSalePerHour).toBe(2700);
  });
});
