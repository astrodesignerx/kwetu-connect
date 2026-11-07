import { describe, expect, it } from "vitest";
import { newComposeKey } from "./compose-keys";

describe("newComposeKey", () => {
  it("returns non-empty unique keys", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newComposeKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key.length).toBeGreaterThan(0);
  });
});
