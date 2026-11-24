import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const watch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mail/watch", () => ({ watchMail: watch }));
import { GET } from "./route";

beforeEach(() => { vi.stubEnv("CRON_SECRET", "test-cron-secret"); watch.mockResolvedValue({ checked: 2, errors: 0, complete: true }); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("mail watch authorisation", () => {
  it.each([undefined, "Bearer wrong", "Basic test-cron-secret", "Bearer test-cron-secret-extra"])("refuses %s without checking a mailbox", async (header) => {
    const response = await GET(new Request("https://example.test/api/cron/mail-watch", { headers: header ? { authorization: header } : {} }));
    expect(response.status).toBe(401);
    expect(watch).not.toHaveBeenCalled();
  });
  it("checks mail with the correct secret and never caches the result", async () => {
    const response = await GET(new Request("https://example.test/api/cron/mail-watch", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ checked: 2, errors: 0, complete: true });
  });
  it("refuses all requests when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", " ");
    expect((await GET(new Request("https://example.test/api/cron/mail-watch", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect(watch).not.toHaveBeenCalled();
  });
  it("returns a safe failure when storage is unavailable", async () => {
    watch.mockRejectedValue(new Error("private diagnostic"));
    const response = await GET(new Request("https://example.test/api/cron/mail-watch", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private diagnostic");
  });
});
