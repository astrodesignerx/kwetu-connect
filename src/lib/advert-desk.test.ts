import { describe, expect, it } from "vitest";
import { applyQuad, checkRows, checkSummary, groupQueue, queuePill, queueSub, quadMatrix, type DeskEntry } from "./advert-desk";
import type { Advert, BookingDetail } from "./store/types";

const detail = (status: string, start = "2026-11-14"): BookingDetail => ({ booking: { status, request: { startDate: start, endDate: "2026-12-11", lengthSeconds: 10 }, reference: "KCA-1" }, advertiser: { business: "Tea Room" } } as unknown as BookingDetail);
const advert = (decision: Advert["decision"], createdAt: string, id = createdAt): Advert => ({ id, bookingId: "b", filePath: "", fileName: "tea-10s.mp4", seconds: 10, decision, reason: "", createdAt });
const entry = (status: string, ad: Advert | null): DeskEntry => ({ detail: detail(status), advert: ad });

describe("advert desk queue", () => {
  const entries = [
    entry("Paid", advert("waiting", "2026-11-07T08:00:00Z")),
    entry("Paid", null), entry("Quote", null),
    ...Array.from({ length: 7 }, (_, n) => entry("Approved", advert("approved", `2026-10-0${n + 1}T08:00:00Z`))),
    entry("Paid", advert("refused", "2026-10-20T08:00:00Z")),
  ];
  it("the Review tab shows three groups and the newest 5 approved", () => {
    const groups = groupQueue(entries, "waiting");
    expect(groups.map((g) => g.title)).toEqual(["To review", "Missing a file", "Approved recently"]);
    expect(groups[2].items).toHaveLength(5);
    expect(groups[2].items[0].advert?.createdAt).toBe("2026-10-07T08:00:00Z");
  });
  it("other tabs show only their own group, all keeps every group", () => {
    expect(groupQueue(entries, "approved").map((g) => g.items.length)).toEqual([7]);
    expect(groupQueue(entries, "refused").map((g) => g.title)).toEqual(["Refused"]);
    expect(groupQueue(entries, "missing")[0].items).toHaveLength(2);
    expect(groupQueue(entries, "all").map((g) => g.title)).toEqual(["To review", "Missing a file", "Approved recently", "Refused"]);
  });
  it("pills use only what is stored", () => {
    expect(queuePill(entry("Paid", advert("waiting", "2026-11-07T08:00:00Z")), "2026-11-09")).toEqual({ tone: "amber", text: "Waiting 2 days" });
    expect(queuePill(entry("Paid", advert("waiting", "2026-11-09T08:00:00Z")), "2026-11-09").text).toBe("Waiting today");
    expect(queuePill(entry("Paid", advert("waiting", "2026-11-08T08:00:00Z")), "2026-11-09").text).toBe("Waiting 1 day");
    expect(queuePill(entry("Approved", advert("approved", "2026-11-01T08:00:00Z")), "2026-11-09").text).toBe("Approved");
    expect(queuePill(entry("Paid", null), "2026-11-09")).toEqual({ tone: "rose", text: "Missing, starts 14 Nov" });
    expect(queuePill(entry("Quote", null), "2026-11-09")).toEqual({ tone: "quiet", text: "Missing, unpaid" });
    expect(queueSub(entry("Quote", null))).toBe("No file yet, quote");
    expect(queueSub(entry("Paid", null))).toBe("No file yet, paid");
  });
});

describe("advert desk checks", () => {
  it("claims nothing before the file is measured", () => {
    const rows = checkRows({ fileName: "a.mp4", seconds: 10, bookedSeconds: 10, shape: null, length: null });
    expect(rows.map((r) => r.state)).toEqual(["unknown", "unknown", "pass", "unknown", "you", "you"]);
    expect(checkSummary(rows, {})).toBe("1 passed, 3 unknown, 2 for you");
    expect(checkSummary(rows, { road: true })).toBe("1 passed, 3 unknown, 1 for you, 1 ticked by you");
  });
  it("uses measured values and fails a declared mismatch", () => {
    const measured = checkRows({ fileName: "a.png", seconds: 10, bookedSeconds: 10, shape: { state: "pass", detail: "768 x 432 px, 16:9." }, length: { state: "pass", detail: "Still image" } });
    expect(measured.slice(0, 3).map((r) => r.state)).toEqual(["pass", "pass", "pass"]);
    expect(measured[2].detail).toContain("PNG still");
    expect(checkRows({ fileName: "a.mp4", seconds: 12, bookedSeconds: 10, shape: null, length: null })[1].state).toBe("fail");
    expect(checkRows({ fileName: "a.mov", seconds: 10, bookedSeconds: 10, shape: null, length: null })[2].state).toBe("fail");
  });
});

describe("road view matrix", () => {
  it("maps the rectangle corners onto the quad", () => {
    const quad: [[number, number], [number, number], [number, number], [number, number]] = [[416, 142], [797, 86], [797, 353], [402, 376]];
    const m = quadMatrix(1200, 675, quad);
    [[0, 0], [1200, 0], [1200, 675], [0, 675]].forEach(([x, y], i) => {
      const [u, v] = applyQuad(m, x, y);
      expect(u).toBeCloseTo(quad[i][0], 3);
      expect(v).toBeCloseTo(quad[i][1], 3);
    });
  });
});
