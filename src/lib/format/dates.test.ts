import { describe, expect, it } from "vitest";
import { dateRange, dayDate, shortDate } from "./dates";

const now = new Date("2026-11-09T10:00:00Z");

describe("manager dates", () => {
  it("gives a short date", () => expect(shortDate("2026-11-14")).toBe("14 Nov"));
  it("gives a day and date", () => expect(dayDate("2026-11-07")).toBe("Sat 7 Nov"));
  it("gives a range without the year in the current year", () => expect(dateRange("2026-11-14", "2026-12-11", now)).toBe("14 Nov to 11 Dec"));
  it("adds the year across a year boundary", () => expect(dateRange("2026-12-28", "2027-01-03", now)).toBe("28 Dec 2026 to 3 Jan 2027"));
  it("adds the year when not in the current year", () => expect(dateRange("2025-03-01", "2025-03-05", now)).toBe("1 Mar 2025 to 5 Mar 2025"));
});
