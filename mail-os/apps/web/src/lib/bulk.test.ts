import { describe, expect, it } from "vitest";
import { bulkArchiveMessage, runEach } from "./bulk";

describe("runEach", () => {
  it("keeps going after a failure and reports the failed ids in order", async () => {
    const result = await runEach(["a", "b", "c", "d", "e"], async (id) => { if (id === "b" || id === "d") throw new Error("no"); }, 2);
    expect(result.done.sort()).toEqual(["a", "c", "e"]);
    expect(result.failed).toEqual(["b", "d"]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0, peak = 0;
    await runEach(["1", "2", "3", "4", "5", "6", "7"], async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    }, 3);
    expect(peak).toBe(3);
  });

  it("handles an empty list", async () => {
    expect(await runEach([], async () => undefined)).toEqual({ done: [], failed: [] });
  });
});

describe("bulkArchiveMessage", () => {
  it("is empty when everything worked", () => expect(bulkArchiveMessage(5, 5)).toBe(""));
  it("counts a partial failure", () => expect(bulkArchiveMessage(3, 5)).toBe("Archived 3 of 5. 2 could not be archived, try again."));
  it("words a total failure", () => {
    expect(bulkArchiveMessage(0, 4)).toBe("None of the 4 conversations could be archived, try again.");
    expect(bulkArchiveMessage(0, 1)).toBe("That conversation could not be archived, try again.");
  });
});
