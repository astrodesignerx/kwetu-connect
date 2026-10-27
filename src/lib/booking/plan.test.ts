import { describe, expect, it } from "vitest";
import { addDays, type BookingRequest } from "./hours";
import { suggestPlan } from "./plan";
import { quote } from "./quote";
import { DEFAULT_SETTINGS } from "./settings";

function allWeekRequest(
  howOften: number,
  weeks: number,
  lengthSeconds = 15
): BookingRequest {
  return {
    lengthSeconds,
    howOften,
    days: [0, 1, 2, 3, 4, 5, 6],
    blocks: ["morning", "midday", "afternoon", "evening", "late"],
    startDate: "2026-11-02",
    endDate: addDays("2026-11-02", weeks * 7 - 1),
  };
}

describe("suggestPlan", () => {
  it("finds the most plays within a KES 10,000 budget", () => {
    const result = suggestPlan(
      { budgetKes: 10000 },
      { lengthSeconds: 15, startDate: "2026-11-02" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let mostPlays = 0;
    for (let weeks = 1; weeks <= 12; weeks += 1) {
      for (const option of DEFAULT_SETTINGS.howOften) {
        const candidate = quote(allWeekRequest(option.plays, weeks));
        if (!candidate.ok) continue;
        if (
          candidate.priceKes <= 10000 &&
          candidate.priceKes >= DEFAULT_SETTINGS.minOrderKes
        ) {
          mostPlays = Math.max(mostPlays, candidate.plays);
        }
      }
    }

    expect(result.quote.priceKes).toBeLessThanOrEqual(10000);
    expect(result.quote.priceKes).toBeGreaterThanOrEqual(
      DEFAULT_SETTINGS.minOrderKes
    );
    expect(result.quote.plays).toBe(mostPlays);
  });

  it("finds the lowest price for a 1,000 play target", () => {
    const result = suggestPlan(
      { plays: 1000 },
      { lengthSeconds: 15, startDate: "2026-11-02" }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let lowestPrice = Number.POSITIVE_INFINITY;
    for (let weeks = 1; weeks <= 12; weeks += 1) {
      for (const option of DEFAULT_SETTINGS.howOften) {
        const candidate = quote(allWeekRequest(option.plays, weeks));
        if (!candidate.ok || candidate.plays < 1000) continue;
        lowestPrice = Math.min(lowestPrice, candidate.priceKes);
      }
    }

    expect(result.quote.plays).toBeGreaterThanOrEqual(1000);
    expect(result.quote.priceKes).toBe(lowestPrice);
  });

  it("refuses a budget below the smallest order", () => {
    const result = suggestPlan(
      { budgetKes: 2000 },
      { lengthSeconds: 15, startDate: "2026-11-02" }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("smallest order");
  });

  it("refuses a play target no whole week can reach", () => {
    const result = suggestPlan(
      { plays: 1000000 },
      { lengthSeconds: 15, startDate: "2026-11-02" }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("No quote reaches that number of plays.");
  });

  it("keeps the requested length, start date and days", () => {
    const result = suggestPlan(
      { plays: 100 },
      {
        lengthSeconds: 10,
        startDate: "2026-11-02",
        days: [6],
        blocks: ["morning", "midday"],
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.lengthSeconds).toBe(10);
    expect(result.request.startDate).toBe("2026-11-02");
    expect(result.request.days).toEqual([6]);
    expect(result.request.blocks).toEqual(["morning", "midday"]);
  });
});
