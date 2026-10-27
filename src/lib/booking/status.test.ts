import { describe, expect, it } from "vitest";
import { canMove, STATUSES, type MoveContext } from "./status";
import type { BookingStatus } from "./capacity";
const context: MoveContext = {
  request: { lengthSeconds: 10, howOften: 10, days: [1], blocks: ["morning"], startDate: "2026-11-02", endDate: "2026-11-29" },
  paymentNote: "MPESA123", note: "Client cancelled", capacity: { ok: true, fullHours: [], suggestions: [], largestHowOftenThatFits: 20 },
};
const adverts = [{ decision: "approved", seconds: 10 }];
describe("status rules", () => {
  const allowed: [BookingStatus, BookingStatus, string][] = [
    ["Quote", "Paid", "2026-10-27"], ["Paid", "Approved", "2026-10-30"],
    ["Approved", "Live", "2026-11-02"], ["Live", "Finished", "2026-11-30"],
    ...(["Quote", "Paid", "Approved", "Live"] as BookingStatus[]).map((s): [BookingStatus, BookingStatus, string] => [s, "Cancelled", "2026-10-27"]),
  ];
  it.each(allowed)("allows %s to %s", (from, to, today) => expect(canMove(from, to, context, adverts, today)).toEqual({ ok: true, reason: "" }));
  for (const from of STATUSES) for (const to of STATUSES) {
    if (allowed.some(([f, t]) => f === from && t === to)) continue;
    it(`refuses ${from} to ${to} with a reason`, () => {
      const result = canMove(from, to, context, adverts, "2026-11-30");
      expect(result.ok).toBe(false); expect(result.reason).toBeTruthy();
    });
  }
  it("requires payment evidence and a fresh capacity result", () => {
    expect(canMove("Quote", "Paid", { ...context, paymentNote: " " }, adverts, "2026-10-27").reason).toContain("M-Pesa");
    expect(canMove("Quote", "Paid", { ...context, capacity: { ...context.capacity!, ok: false } }, adverts, "2026-10-27").reason).toContain("Space is unavailable");
    expect(canMove("Quote", "Paid", { ...context, capacity: undefined }, adverts, "2026-10-27").ok).toBe(false);
  });
  it("requires approved adverts of exactly the right length", () => {
    expect(canMove("Paid", "Approved", context, [], "2026-10-27").reason).toContain("at least one");
    expect(canMove("Paid", "Approved", context, [{ decision: "waiting", seconds: 10 }], "2026-10-27").ok).toBe(false);
    expect(canMove("Paid", "Approved", context, [...adverts, { decision: "approved", seconds: 15 }], "2026-10-27").reason).toContain("match");
  });
  it("checks working days, holidays and date boundaries", () => {
    expect(canMove("Paid", "Approved", context, adverts, "2026-10-31").reason).toContain("working day");
    expect(canMove("Approved", "Live", context, adverts, "2026-11-01").reason).toContain("start date");
    expect(canMove("Live", "Finished", context, adverts, "2026-11-29").reason).toContain("after the end");
  });
  it("requires a cancellation note", () => expect(canMove("Quote", "Cancelled", { ...context, note: "" }, adverts, "2026-10-27").reason).toContain("note"));
});
