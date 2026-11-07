import { describe, expect, it } from "vitest";
import {
  TERMINAL_MAX_ATTEMPTS,
  TERMINAL_MAX_MS,
  terminalAttemptsExhausted,
  terminalBackoffDelay,
} from "./signalr-backoff";

describe("terminalBackoffDelay", () => {
  it("backs off exponentially from one second", () => {
    expect(terminalBackoffDelay(0)).toBe(1000);
    expect(terminalBackoffDelay(1)).toBe(2000);
    expect(terminalBackoffDelay(2)).toBe(4000);
  });

  it("caps the delay", () => {
    expect(terminalBackoffDelay(100)).toBe(TERMINAL_MAX_MS);
    expect(terminalBackoffDelay(10)).toBeLessThanOrEqual(TERMINAL_MAX_MS);
  });

  it("treats negative input as first attempt", () => {
    expect(terminalBackoffDelay(-5)).toBe(1000);
  });
});

describe("terminalAttemptsExhausted", () => {
  it("gives up after the bounded attempts, not before", () => {
    expect(terminalAttemptsExhausted(TERMINAL_MAX_ATTEMPTS - 1)).toBe(false);
    expect(terminalAttemptsExhausted(TERMINAL_MAX_ATTEMPTS)).toBe(true);
  });
});
