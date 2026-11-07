import { describe, expect, it } from "vitest";
import { connectChecklist, invitationExpiry, passwordStrength, utcHourValues } from "@/lib/signal-settings";

describe("password guidance without changing the server policy", () => {
  it("reports each rule independently", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abcdefgh").rules.map((rule) => rule.met)).toEqual([true, false, false, false]);
    expect(passwordStrength("Abcdef12!").score).toBe(4);
    expect(passwordStrength("Ab1!").rules[0].met).toBe(false);
    expect(passwordStrength("Abcdef12 ").rules[3].met).toBe(false);
  });
});
describe("connection checklist follows server calls", () => {
  it("never claims saved credentials or a test before a successful call", () => {
    expect(connectChecklist("idle").map((step) => step.state)).toEqual(["waiting", "waiting", "waiting"]);
    expect(connectChecklist("connecting").map((step) => step.state)).toEqual(["running", "waiting", "waiting"]);
    expect(connectChecklist("connect-error").map((step) => step.state)).toEqual(["error", "waiting", "waiting"]);
    expect(connectChecklist("connected").map((step) => step.state)).toEqual(["complete", "complete", "waiting"]);
    expect(connectChecklist("verifying").map((step) => step.state)).toEqual(["complete", "complete", "running"]);
    expect(connectChecklist("verify-error").map((step) => step.state)).toEqual(["complete", "complete", "error"]);
    expect(connectChecklist("verified").every((step) => step.state === "complete")).toBe(true);
  });
});
describe("invitation expiry", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  it("handles boundaries and rounds future remaining time up", () => {
    expect(invitationExpiry("2026-10-22T12:00:00Z", "pending", now)).toBe("Expired");
    expect(invitationExpiry("2026-10-22T12:01:00Z", "pending", now)).toBe("Expires within an hour");
    expect(invitationExpiry("2026-10-22T13:01:00Z", "pending", now)).toBe("Expires in 2 hours");
    expect(invitationExpiry("2026-10-23T11:01:00Z", "pending", now)).toBe("Expires in 24 hours");
    expect(invitationExpiry("2026-10-23T12:00:00Z", "pending", now)).toBe("Expires in 1 day");
    expect(invitationExpiry("2026-10-28T12:00:00Z", "pending", now)).toBe("Expires in 6 days");
    expect(invitationExpiry("invalid", "pending", now)).toBe("Expiry unavailable");
  });
  it("respects terminal server states", () => {
    expect(invitationExpiry("2026-10-28T12:00:00Z", "expired", now)).toBe("Expired");
    expect(invitationExpiry("2026-10-21T12:00:00Z", "accepted", now)).toBe("Accepted");
    expect(invitationExpiry("2026-10-28T12:00:00Z", "revoked", now)).toBe("Revoked");
  });
});

describe("hour bars use UTC clock labels", () => {
  it("puts rolling-window timestamps under their actual UTC hour", () => {
    const values = utcHourValues([
      { hour: "2026-10-21T23:00:00Z", count: 2 },
      { hour: "2026-10-22T00:00:00Z", count: 3 },
      { hour: "2026-10-22T01:00:00Z", count: 4 },
    ]);
    expect(values).toHaveLength(24);
    expect(values[23]).toBe(2);
    expect(values[0]).toBe(3);
    expect(values[1]).toBe(4);
    expect(values[12]).toBe(0);
  });
});
