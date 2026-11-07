import { describe, expect, it } from "vitest";
import { barScale, dateKey, dayNumber, flightPosition, heatmapGrid, sparkPoints, todayPosition } from "./scales";

describe("Spark points", () => {
  it("fits the full range inside the point radius with consistent spacing", () => {
    expect(sparkPoints([10, 20, 30], 110, 50)).toEqual([{ x: 5, y: 45 }, { x: 55, y: 25 }, { x: 105, y: 5 }]);
  });
  it("centres a single point and flat series without dividing by zero", () => {
    expect(sparkPoints([7], 100, 40)).toEqual([{ x: 50, y: 20 }]);
    expect(sparkPoints([4, 4], 100, 40)).toEqual([{ x: 5, y: 20 }, { x: 95, y: 20 }]);
    expect(sparkPoints([])).toEqual([]);
  });
  it("handles negative values, non-finite samples and tiny dimensions", () => {
    const points = sparkPoints([-5, Number.NaN, 5], 0, 0);
    expect(points).toEqual([{ x: 5, y: 7 }, { x: 6, y: 6 }, { x: 7, y: 5 }]);
  });
});

describe("HourBars peak and bar scale", () => {
  it("highlights the first largest hour when peak values tie", () => {
    expect(barScale([0, 2, 4, 4, 1])).toEqual({ heights: [0, 50, 100, 100, 25], peak: 2 });
  });
  it("has no peak for empty, zero, negative or invalid input", () => {
    expect(barScale([])).toEqual({ heights: [], peak: null });
    expect(barScale([0, -3, Number.NaN, Infinity])).toEqual({ heights: [0, 0, 0, 0], peak: null });
  });
});

describe("Heatmap calendar", () => {
  it("returns complete Monday-first weeks with future days in the current week", () => {
    const grid = heatmapGrid("2026-10-22", 3);
    expect(grid.columns).toHaveLength(3);
    expect(grid.columns.every((week) => week.length === 7)).toBe(true);
    expect(grid.start).toBe("2026-10-05");
    expect(grid.columns[2].map((day) => day.future)).toEqual([false, false, false, false, true, true, true]);
    expect(grid.columns[2][6].date).toBe("2026-10-25");
  });
  it("places month labels at their week column across a year boundary", () => {
    const grid = heatmapGrid("2027-01-06", 4);
    expect(grid.months).toEqual([{ label: "Dec", week: 0, date: "2026-12-14" }, { label: "Jan", week: 2, date: "2027-01-01" }]);
  });
  it("places a month starting on Monday in the new column", () => {
    expect(heatmapGrid("2026-06-03", 2).months).toEqual([{ label: "May", week: 0, date: "2026-05-25" }, { label: "Jun", week: 1, date: "2026-06-01" }]);
  });
  it("handles leap years and Sunday without adding an extra week", () => {
    const grid = heatmapGrid("2024-03-03", 1);
    expect(grid.columns[0][3].date).toBe("2024-02-29");
    expect(grid.columns[0].every((day) => !day.future)).toBe(true);
  });
  it("clamps the number of weeks and rejects malformed dates", () => {
    expect(heatmapGrid("2026-10-22", 0).columns).toHaveLength(1);
    expect(heatmapGrid("2026-10-22", 100).columns).toHaveLength(53);
    expect(() => dayNumber("2026-02-30")).toThrow(RangeError);
    expect(() => dayNumber("22 Oct 2026")).toThrow(RangeError);
  });
  it("uses UTC calendar days across daylight saving changes", () => {
    expect(dayNumber("2026-03-30") - dayNumber("2026-03-28")).toBe(2);
    expect(dateKey(dayNumber(new Date("2026-10-22T23:59:00Z")))).toBe("2026-10-22");
  });
});

describe("FlightPlan six-week positions", () => {
  it("uses inclusive end dates so a seven-day campaign fills one week", () => {
    const position = flightPosition("2026-10-19", "2026-10-25", "2026-10-12")!;
    expect(position.left).toBeCloseTo(100 / 6);
    expect(position.width).toBeCloseTo(100 / 6);
  });
  it("clips both ends to the timeline", () => {
    expect(flightPosition("2026-10-01", "2026-12-01", "2026-10-12")).toEqual({ left: 0, width: 100 });
    const position = flightPosition("2026-10-10", "2026-10-12", "2026-10-12")!;
    expect(position.left).toBe(0);
    expect(position.width).toBeCloseTo(100 / 42);
  });
  it("omits campaigns outside the window and reversed dates", () => {
    expect(flightPosition("2026-10-01", "2026-10-11", "2026-10-12")).toBeNull();
    expect(flightPosition("2026-11-23", "2026-12-01", "2026-10-12")).toBeNull();
    expect(flightPosition("2026-10-20", "2026-10-19", "2026-10-12")).toBeNull();
  });
  it("supports a one-day campaign on the last visible day", () => {
    const position = flightPosition("2026-11-22", "2026-11-22", "2026-10-12")!;
    expect(position.left).toBeCloseTo(41 / 42 * 100);
    expect(position.width).toBeCloseTo(100 / 42);
  });
  it("shows today only within the timeline", () => {
    expect(todayPosition("2026-10-12", "2026-10-12")).toBe(0);
    expect(todayPosition("2026-10-22", "2026-10-12")).toBeCloseTo(10 / 42 * 100);
    expect(todayPosition("2026-10-11", "2026-10-12")).toBeNull();
    expect(todayPosition("2026-11-23", "2026-10-12")).toBeNull();
  });
});
