import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memory: false,
  cookieValue: undefined as string | undefined,
  cookieSet: vi.fn(),
  isStaff: vi.fn(async () => true),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kca_auth_next" && mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
    set: mocks.cookieSet,
    getAll: () => [],
  }),
}));
vi.mock("@/lib/store", () => ({
  isMemoryMode: () => mocks.memory,
  getStore: () => ({ isStaff: mocks.isStaff }),
}));
vi.mock("@/lib/auth/server", () => ({
  authClient: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memory = false;
  mocks.cookieValue = undefined;
  mocks.isStaff.mockResolvedValue(true);
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { email: "admin@kwetuconnectads.co.ke" } } });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("staff auth callback", () => {
  it("redirects to /mail when kca_auth_next cookie targets /mail and clears the cookie", async () => {
    mocks.cookieValue = "/mail";
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=email"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(response.headers.get("location")).toBe("https://example.test/mail");
    expect(mocks.cookieSet).toHaveBeenCalledWith("kca_auth_next", "", expect.objectContaining({ path: "/manage", maxAge: 0 }));
  });

  it("redirects to /manage/password?next=/mail when cookie was set for password setup", async () => {
    mocks.cookieValue = "/manage/password?next=/mail";
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=email"));
    expect(response.headers.get("location")).toBe("https://example.test/manage/password?next=/mail");
    expect(mocks.cookieSet).toHaveBeenCalledWith("kca_auth_next", "", expect.objectContaining({ path: "/manage", maxAge: 0 }));
  });

  it("routes recovery links to /manage/password when no cookie is present", async () => {
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=recovery"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(response.headers.get("location")).toBe("https://example.test/manage/password");
  });

  it("rejects open redirect values inside the kca_auth_next cookie", async () => {
    mocks.cookieValue = "//evil.test";
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=email"));
    expect(response.headers.get("location")).toBe("https://example.test/manage");

    mocks.cookieValue = "https://evil.test/mail";
    const second = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=email"));
    expect(second.headers.get("location")).toBe("https://example.test/manage");
  });

  it("signs out, clears cookie and returns to sign-in preserving next=/mail when verification fails", async () => {
    mocks.cookieValue = "/mail";
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "Token has expired" } });
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=bad&type=email"));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.cookieSet).toHaveBeenCalledWith("kca_auth_next", "", expect.objectContaining({ path: "/manage", maxAge: 0 }));
    expect(response.headers.get("location")).toBe("https://example.test/mail/sign-in?error=link");
  });

  it("signs out non-staff accounts cleanly", async () => {
    mocks.isStaff.mockResolvedValueOnce(false);
    const response = await GET(new NextRequest("https://example.test/manage/auth/callback?token_hash=abc&type=email"));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("https://example.test/manage/sign-in?error=link");
  });
});
