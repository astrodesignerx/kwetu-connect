import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ memory: true, cookie: undefined as undefined | string, staff: true, user: { email: "staff@example.test" } as { email: string } | null, redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined, getAll: () => [] }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/store", () => ({ isMemoryMode: () => mocks.memory, getStore: () => ({ isStaff: async () => mocks.staff }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) } }) }));
import { requireStaff } from "@/lib/auth/server";
beforeEach(() => { mocks.memory = true; mocks.cookie = undefined; mocks.staff = true; mocks.user = { email: "staff@example.test" }; });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("mail shares the staff sign-in", () => {
  it("allows the local sample without granting access to the manager", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await requireStaff("/mail")).toEqual({ email: "demo@kca.local" });
    await expect(requireStaff()).rejects.toThrow("redirect:/manage/sign-in");
  });
  it("never grants the mail demo bypass in production or tests", async () => {
    for (const env of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      await expect(requireStaff("/mail")).rejects.toThrow("redirect:/manage/sign-in?next=/mail");
    }
  });
  it("requires a real staff account when Supabase is configured", async () => {
    mocks.memory = false;
    expect(await requireStaff("/mail")).toEqual({ email: "staff@example.test" });
    mocks.staff = false;
    await expect(requireStaff("/mail")).rejects.toThrow("redirect:/manage/sign-in?next=/mail");
    mocks.user = null;
    await expect(requireStaff("/mail")).rejects.toThrow("redirect:/manage/sign-in?next=/mail");
  });
});
