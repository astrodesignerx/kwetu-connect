import { describe, expect, it } from "vitest";
import { checkCapacity, type ExistingBooking } from "./capacity";
import type { BookingRequest } from "./hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

const oneHourSettings: BookingSettings = {
  ...DEFAULT_SETTINGS,
  timeBlocks: {
    ...DEFAULT_SETTINGS.timeBlocks,
    morning: { startHour: 6, endHour: 7, label: "Morning" },
  },
};

function request(lengthSeconds = 5, howOften = 1): BookingRequest {
  return {
    lengthSeconds,
    howOften,
    days: [1],
    blocks: ["morning"],
    startDate: "2026-11-02",
    endDate: "2026-11-02",
  };
}

function existingBooking(
  id: string,
  status: ExistingBooking["status"],
  lengthSeconds: number,
  howOften: number,
  advertiserId = "other"
): ExistingBooking {
  return {
    id,
    advertiserId,
    status,
    request: {
      lengthSeconds,
      howOften,
      days: [1],
      blocks: ["morning"],
      startDate: "2026-11-02",
      endDate: "2026-11-02",
    },
  };
}

function filledHour(status: ExistingBooking["status"]): ExistingBooking[] {
  return Array.from({ length: 9 }, (_, index) =>
    existingBooking(`filler-${index}`, status, 30, 10)
  );
}

describe("checkCapacity", () => {
  it("refuses one more play when the hour already holds 2,700 seconds", () => {
    const result = checkCapacity(
      request(5, 1),
      "mine",
      filledHour("Paid"),
      oneHourSettings
    );

    expect(result.ok).toBe(false);
    expect(result.fullHours).toHaveLength(1);
    expect(result.fullHours[0].hour).toBe("2026-11-02T06");
    expect(result.suggestions).toEqual([
      { hour: "2026-11-02T06", suggestedHour: "2026-11-02T07" },
    ]);
    expect(result.largestHowOftenThatFits).toBeNull();
  });

  it("counts an advertiser's plays in the hour", () => {
    const existing = [
      existingBooking("first", "Paid", 5, 10, "mine"),
      existingBooking("second", "Paid", 5, 10, "mine"),
    ];

    const result = checkCapacity(
      request(5, 1),
      "mine",
      existing,
      oneHourSettings
    );

    expect(result.ok).toBe(false);
    expect(result.fullHours[0].hour).toBe("2026-11-02T06");
    expect(result.fullHours[0].reason).toBe(
      "This advertiser already has the most plays allowed in this hour."
    );
    expect(result.largestHowOftenThatFits).toBeNull();
  });

  it.each(["Quote", "Cancelled"] as const)(
    "lets a %s booking hold no space",
    (status) => {
      const result = checkCapacity(
        request(5, 1),
        "mine",
        filledHour(status),
        oneHourSettings
      );

      expect(result.ok).toBe(true);
      expect(result.fullHours).toEqual([]);
    }
  );

  it("finds the largest how often value that still fits", () => {
    const existing = [
      ...Array.from({ length: 8 }, (_, index) =>
        existingBooking(`long-${index}`, "Paid", 30, 10)
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        existingBooking(`short-${index}`, "Paid", 5, 10)
      ),
    ];

    const result = checkCapacity(
      request(15, 10),
      "mine",
      existing,
      oneHourSettings
    );

    expect(result.ok).toBe(false);
    expect(result.largestHowOftenThatFits).toBe(6);
  });

  it("suggests null when no nearby hour has space", () => {
    const full = Array.from({ length: 9 }, (_, index) =>
      existingBooking(`filler-${index}`, "Paid", 30, 10)
    );
    const settings: BookingSettings = {
      ...DEFAULT_SETTINGS,
      screenHours: {
        ...DEFAULT_SETTINGS.screenHours,
        1: { open: 6, close: 7 },
      },
    };

    const result = checkCapacity(request(5, 1), "mine", full, settings);
    expect(result.suggestions).toEqual([
      { hour: "2026-11-02T06", suggestedHour: null },
    ]);
  });
});
