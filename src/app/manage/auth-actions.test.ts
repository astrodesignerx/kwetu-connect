import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memory: false,
  origin: "https://example.test" as string | null,
  isStaff: vi.fn(async () => true),
  requireStaff: vi.fn(async () => ({ email: "admin@kwetuconnectads.co.ke" })),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error("redirect:" + path);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet, getAll: () => [] }),
  headers: async () => ({ get: (name: string) => (name === "origin" ? mocks.origin : null) }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/store", () => ({
  isMemoryMode: () => mocks.memory,
  getStore: () => ({ isStaff: mocks.isStaff }),
}));
vi.mock("@/lib/auth/server", () => ({
  requireStaff: mocks.requireStaff,
  authClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signInWithOtp: mocks.signInWithOtp,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { AUTH_NEXT_COOKIE, passwordSetupPath, safeCallbackNext, safeSignInNext } from "@/lib/auth/next";
import { signIn, signInWithPassword, signOut, signOutOfMail, updateStaffPassword } from "./auth-actions";

function makeForm(entries: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memory = false;
  mocks.origin = "https://example.test";
  mocks.isStaff.mockResolvedValue(true);
  mocks.requireStaff.mockResolvedValue({ email: "admin@kwetuconnectads.co.ke" });
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { email: "admin@kwetuconnectads.co.ke" } }, error: null });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth redirect helpers", () => {
  it("allows only /manage and /mail for sign-in next", () => {
    expect(safeSignInNext("/mail")).toBe("/mail");
    expect(safeSignInNext("/manage")).toBe("/manage");
    expect(safeSignInNext("https://evil.test")).toBe("/manage");
    expect(safeSignInNext("//evil.test")).toBe("/manage");
    expect(safeSignInNext("/book")).toBe("/manage");
  });

  it("builds password setup paths and restricts callback destinations", () => {
    expect(passwordSetupPath("/mail")).toBe("/manage/password?next=/mail");
    expect(passwordSetupPath("/manage")).toBe("/manage/password");
    expect(safeCallbackNext("/mail")).toBe("/mail");
    expect(safeCallbackNext("/manage/password")).toBe("/manage/password");
    expect(safeCallbackNext("/manage/password?next=/mail")).toBe("/manage/password?next=/mail");
    expect(safeCallbackNext("//evil.test")).toBe("/manage");
    expect(safeCallbackNext("https://evil.test/mail")).toBe("/manage");
  });
});

describe("signInWithPassword", () => {
  it("signs in valid staff and preserves spaces inside password", async () => {
    await expect(
      signInWithPassword({ message: "" }, makeForm({ email: "Admin@kwetuconnectads.co.ke", password: "  correct horse battery  ", next: "/mail" })),
    ).rejects.toThrow("redirect:/mail");

    expect(mocks.isStaff).toHaveBeenCalledWith("admin@kwetuconnectads.co.ke");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@kwetuconnectads.co.ke",
      password: "  correct horse battery  ",
    });
  });

  it("uses the same credential guidance for non-staff and staff emails", async () => {
    mocks.isStaff.mockResolvedValueOnce(false);
    const outsideStaff = await signInWithPassword({ message: "" }, makeForm({ email: "other@example.test", password: "wrongpassword" }));
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();

    mocks.signInWithPassword.mockResolvedValueOnce({ data: { user: null }, error: { status: 400, message: "Invalid login credentials" } });
    const wrongPassword = await signInWithPassword({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", password: "wrongpassword" }));
    expect(wrongPassword).toEqual(outsideStaff);
    expect(wrongPassword.message).toContain("Set or reset password");
  });

  it("returns cooldown guidance on rate limit", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: { user: null }, error: { status: 429, message: "Too many requests" } });
    const limited = await signInWithPassword({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", password: "wrongpassword" }));
    expect(limited.message).toBe("Too many attempts. Wait a minute and try again.");
  });

  it("signs out immediately if Supabase returns a non-staff user", async () => {
    mocks.isStaff.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { email: "intruder@example.test" } }, error: null });
    const result = await signInWithPassword({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", password: "validpassword" }));
    expect(result.message).toMatch(/^Incorrect email or password\./);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("enters demo mode when Supabase is not configured", async () => {
    mocks.memory = true;
    await expect(signInWithPassword({ message: "" }, makeForm({ next: "/mail" }))).rejects.toThrow("redirect:/mail");
    expect(mocks.cookieSet).toHaveBeenCalledWith("kca_demo", "1", expect.objectContaining({ path: "/", httpOnly: true }));
  });
});

describe("signIn email link and password setup links", () => {
  it("stores next=/mail in an HttpOnly cookie and sends a clean callback URL without query params", async () => {
    const result = await signIn({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", next: "/mail", mode: "link" }));
    expect(result).toEqual({ message: "If this email belongs to KCA staff, a sign-in link is on its way." });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      AUTH_NEXT_COOKIE,
      "/mail",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/manage" }),
    );
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "admin@kwetuconnectads.co.ke",
      options: { shouldCreateUser: false, emailRedirectTo: "https://example.test/manage/auth/callback" },
    });
  });

  it("stores password setup return path when mode is reset", async () => {
    const result = await signIn({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", next: "/mail", mode: "reset" }));
    expect(result).toEqual({ message: "If this email belongs to KCA staff, a password setup link is on its way." });
    expect(mocks.cookieSet).toHaveBeenCalledWith(AUTH_NEXT_COOKIE, "/manage/password?next=/mail", expect.any(Object));
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "admin@kwetuconnectads.co.ke",
      options: { shouldCreateUser: false, emailRedirectTo: "https://example.test/manage/auth/callback" },
    });
  });

  it("returns a neutral response for non-staff and leaves the return cookie alone on rate limit", async () => {
    mocks.isStaff.mockResolvedValueOnce(false);
    const neutral = await signIn({ message: "" }, makeForm({ email: "stranger@example.test", next: "/mail", mode: "link" }));
    expect(neutral.message).toBe("If this email belongs to KCA staff, a sign-in link is on its way.");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();

    mocks.signInWithOtp.mockResolvedValueOnce({ error: { status: 429, message: "For security purposes, you can only request this after 58 seconds." } });
    const rate = await signIn({ message: "" }, makeForm({ email: "admin@kwetuconnectads.co.ke", next: "/manage", mode: "link" }));
    expect(rate.message).toBe("Wait a minute before requesting another link.");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("updateStaffPassword", () => {
  it("requires an authenticated staff session", async () => {
    mocks.requireStaff.mockRejectedValueOnce(new Error("redirect:/manage/sign-in"));
    await expect(updateStaffPassword({ message: "" }, makeForm({ password: "validpassword1", confirm: "validpassword1" }))).rejects.toThrow(
      "redirect:/manage/sign-in",
    );
  });

  it("enforces minimum length and matching confirmation", async () => {
    const short = await updateStaffPassword({ message: "" }, makeForm({ password: "short", confirm: "short" }));
    expect(short.message).toBe("Use at least 12 characters for your password.");

    const mismatch = await updateStaffPassword({ message: "" }, makeForm({ password: "validpassword1", confirm: "validpassword2" }));
    expect(mismatch.message).toBe("The two passwords do not match.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password without trimming spaces and redirects to next", async () => {
    await expect(
      updateStaffPassword({ message: "" }, makeForm({ password: "  pass phrase 123  ", confirm: "  pass phrase 123  ", next: "/mail" })),
    ).rejects.toThrow("redirect:/mail");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "  pass phrase 123  " });
  });

  it("reports demo restriction cleanly in memory mode", async () => {
    mocks.memory = true;
    const result = await updateStaffPassword({ message: "" }, makeForm({ password: "validpassword1", confirm: "validpassword1" }));
    expect(result.message).toBe("Passwords are not saved in demo mode.");
  });
});

describe("signing out", () => {
  it("returns the manager to its sign-in page and mail to its own", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/manage/sign-in");
    await expect(signOutOfMail()).rejects.toThrow("redirect:/mail/sign-in");
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.cookieSet).toHaveBeenCalledWith("kca_demo", "", { path: "/", maxAge: 0 });
  });
});
