import { describe, expect, it } from "vitest";
import { bookedHours } from "./hours";
import { fromCells, quickPick, scheduleLines, toggleSelection, type Selection } from "./selection";
import { DEFAULT_SETTINGS } from "./settings";

const initial: Selection = { days: [6], blocks: ["morning", "midday"] };
describe("timetable selection", () => {
  it("adds only the box that was tapped", () => {
    const next = toggleSelection(initial, { kind: "cell", day: 5, block: "late" });
    expect(next.cells).toEqual(["5-late", "6-morning", "6-midday"]);
    expect(next.days).toEqual([5, 6]);
    expect(next.blocks).toEqual(["morning", "midday", "late"]);
    expect(initial).toEqual({ days: [6], blocks: ["morning", "midday"] });
  });
  it("removes only the box that was tapped", () => {
    const next = toggleSelection({ days: [1, 6], blocks: ["morning"] }, { kind: "cell", day: 6, block: "morning" });
    expect(next).toEqual({ cells: ["1-morning"], days: [1], blocks: ["morning"] });
  });
  it("allows an empty selection and rebuilding it", () => {
    const empty = toggleSelection({ days: [6], blocks: ["morning"] }, { kind: "cell", day: 6, block: "morning" });
    expect(empty).toEqual({ cells: [], days: [], blocks: [] });
    expect(toggleSelection(empty, { kind: "cell", day: 0, block: "late" }).cells).toEqual(["0-late"]);
  });
  it("day and time headers fill or clear their open boxes only", () => {
    const lateClosed = (day: number, block: string) => !(block === "late" && day >= 1 && day <= 4);
    expect(toggleSelection(initial, { kind: "day", day: 6 }).cells).toEqual(["6-morning", "6-midday", "6-afternoon", "6-evening", "6-late"]);
    expect(toggleSelection(initial, { kind: "day", day: 1 }, lateClosed).cells).toEqual(["1-morning", "1-midday", "1-afternoon", "1-evening", "6-morning", "6-midday"]);
    expect(toggleSelection(initial, { kind: "block", block: "late" }, lateClosed).cells).toEqual(["5-late", "6-morning", "6-midday", "6-late", "0-late"]);
    expect(toggleSelection({ cells: ["6-morning", "6-midday", "6-afternoon", "6-evening", "6-late"], days: [6], blocks: [] }, { kind: "day", day: 6 }).cells).toEqual([]);
    expect(toggleSelection(initial, { kind: "cell", day: 2, block: "late" }, lateClosed).cells).toEqual(["6-morning", "6-midday"]);
  });
  it("orders cells and drops bad keys", () => {
    expect(fromCells(["0-late", "1-morning", "1-morning", "9-late", "1-lunch"]).cells).toEqual(["1-morning", "0-late"]);
  });
  it("books only the chosen boxes, not every chosen day times every chosen time", () => {
    const base = { lengthSeconds: 10, howOften: 10, startDate: "2026-11-06", endDate: "2026-11-07" };
    const grid = bookedHours({ ...base, days: [5, 6], blocks: ["morning", "late"] });
    const boxes = bookedHours({ ...base, ...fromCells(["5-late", "6-morning"]) });
    expect(grid.length).toBe(12);
    expect(boxes).toEqual(["2026-11-06T22", "2026-11-06T23", "2026-11-07T06", "2026-11-07T07", "2026-11-07T08", "2026-11-07T09"]);
  });
});

describe("schedule lines", () => {
  it("groups days that share the same times", () => {
    expect(scheduleLines(fromCells(["5-late", "6-morning", "6-midday", "0-morning", "0-midday"]), DEFAULT_SETTINGS.timeBlocks)).toEqual(["Fri: Late", "Sat, Sun: Morning, Midday"]);
    expect(scheduleLines({ days: [1, 2, 3, 4, 5, 6, 0], blocks: ["morning", "midday", "afternoon", "evening", "late"] }, DEFAULT_SETTINGS.timeBlocks)).toEqual(["Every day: All day"]);
  });
});

describe("closed boxes", () => {
  const lateClosedMonToThu = (day: number, block: string) => !(block === "late" && day >= 1 && day <= 4);
  it("openSelection drops closed boxes so the summary never lists them", async () => {
    const { openSelection, scheduleLines } = await import("./selection");
    const picked = openSelection({ days: [], blocks: [], cells: ["3-late", "6-late", "1-morning"] }, lateClosedMonToThu);
    expect(picked.cells).toEqual(["1-morning", "6-late"]);
    const labels = { morning: { label: "Morning" }, midday: { label: "Midday" }, afternoon: { label: "Afternoon" }, evening: { label: "Evening" }, late: { label: "Late" } };
    expect(scheduleLines(picked, labels).join(" ")).not.toContain("Wed");
  });
  it("toggling a box also clears closed boxes left from an older link", async () => {
    const { toggleSelection } = await import("./selection");
    const next = toggleSelection({ days: [], blocks: [], cells: ["3-late", "6-late"] }, { kind: "cell", day: 0, block: "late" }, lateClosedMonToThu);
    expect(next.cells).toEqual(["6-late", "0-late"]);
  });
});

describe("quick picks", () => {
  const all = () => true;
  it("picks every morning, every evening and the weekend", () => {
    expect(quickPick("mornings", all).cells).toHaveLength(7);
    expect(quickPick("mornings", all).blocks).toEqual(["morning"]);
    expect(quickPick("evenings", all).blocks).toEqual(["evening"]);
    const weekend = quickPick("weekends", all);
    expect(weekend.days).toEqual([6, 0]);
    expect(weekend.cells).toHaveLength(10);
  });
  it("clears the selection", () => expect(quickPick("clear", all).cells).toEqual([]));
  it("keeps only open boxes", () => {
    const next = quickPick("weekends", (day, block) => day === 6 && block === "late");
    expect(next.cells).toEqual(["6-late"]);
  });
  it("gives nothing when no box is open", () => expect(quickPick("evenings", () => false).cells).toEqual([]));
});
