import { describe, expect, it } from "vitest";
import { toggleSelection, type Selection } from "./selection";

const initial: Selection = { days: [6], blocks: ["morning", "midday"] };
describe("timetable selection", () => {
  it("adds both the day and block of an unselected cell", () => {
    expect(toggleSelection(initial, { kind: "cell", day: 1, block: "evening" })).toEqual({ days: [1, 6], blocks: ["morning", "midday", "evening"] });
    expect(initial).toEqual({ days: [6], blocks: ["morning", "midday"] });
  });
  it("removes a selected block across all chosen days when there is more than one block", () => {
    expect(toggleSelection({ ...initial, days: [1, 6] }, { kind: "cell", day: 6, block: "morning" })).toEqual({ days: [1, 6], blocks: ["midday"] });
  });
  it("removes only the day when the last block is tapped", () => {
    expect(toggleSelection({ days: [1, 6], blocks: ["morning"] }, { kind: "cell", day: 6, block: "morning" })).toEqual({ days: [1], blocks: ["morning"] });
  });
  it("allows an empty selection and rebuilding it", () => {
    const empty = toggleSelection({ days: [6], blocks: ["morning"] }, { kind: "cell", day: 6, block: "morning" });
    expect(empty.days).toEqual([]);
    expect(toggleSelection(empty, { kind: "cell", day: 0, block: "late" })).toEqual({ days: [0], blocks: ["morning", "late"] });
  });
  it("toggles headers without duplicate days or blocks", () => {
    expect(toggleSelection(initial, { kind: "day", day: 6 }).days).toEqual([]);
    expect(toggleSelection(initial, { kind: "day", day: 0 }).days).toEqual([6, 0]);
    expect(toggleSelection(initial, { kind: "block", block: "midday" }).blocks).toEqual(["morning"]);
    expect(toggleSelection(initial, { kind: "cell", day: 6, block: "late" }).days).toEqual([6]);
  });
});
