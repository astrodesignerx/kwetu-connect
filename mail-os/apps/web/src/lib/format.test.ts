import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatDateTime, formatDuration, formatShortDate, formatTime, formatWeekday, formatWhen, plural } from "./format";

// 08:00 UTC is 11:00 in Nairobi.
const saturday = "2026-11-08T08:00:00Z";

describe("format", () => {
  it("writes dates one way", () => {
    expect(formatDate(saturday)).toBe("8 Nov 2026");
    expect(formatShortDate(saturday)).toBe("8 Nov");
    expect(formatWeekday(saturday)).toBe("Sun");
    expect(formatTime(saturday)).toBe("11:00");
    expect(formatDateTime(saturday)).toBe("8 Nov 2026, 11:00");
    expect(formatDate("2026-09-01")).toBe("1 Sep 2026");
    expect(formatDate(null, "Not yet")).toBe("Not yet");
    expect(formatDate("not a date")).toBe("");
  });

  it("keeps calendar dates on their day", () => {
    expect(formatDate("2026-11-14")).toBe("14 Nov 2026");
    expect(formatWeekday("2026-11-14")).toBe("Sat");
  });

  it("writes ranges with one year when they share it", () => {
    expect(formatDateRange("2026-11-14", "2026-12-11")).toBe("14 Nov to 11 Dec 2026");
    expect(formatDateRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 to 3 Jan 2027");
    expect(formatDateRange("2026-11-14", "2026-11-14")).toBe("14 Nov 2026");
  });

  it("stamps list rows by age", () => {
    const now = "2026-11-08T15:00:00Z";
    expect(formatWhen("2026-11-08T08:00:00Z", now)).toBe("11:00");
    expect(formatWhen("2026-11-05T08:00:00Z", now)).toBe("Thu");
    expect(formatWhen("2026-10-01T08:00:00Z", now)).toBe("1 Oct");
    expect(formatWhen("2025-10-01T08:00:00Z", now)).toBe("1 Oct 2025");
  });

  it("writes durations in one form", () => {
    expect(formatDuration(30)).toBe("1m");
    expect(formatDuration(45 * 60)).toBe("45m");
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(60 * 60 * 60)).toBe("2d 12h");
  });

  it("pluralises counts", () => {
    expect(plural(1, "contact")).toBe("1 contact");
    expect(plural(3, "contact")).toBe("3 contacts");
    expect(plural(2, "reply", "replies")).toBe("2 replies");
    expect(plural(0, "invitation")).toBe("0 invitations");
  });
});
