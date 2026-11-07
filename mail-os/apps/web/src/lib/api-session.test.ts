import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api, handleUnauthorized } from "./api";
import { useAuthStore } from "./auth-store";
import { beginSession, endSession } from "./session";

const user = {
  id: "u1",
  email: "a@test.local",
  username: "a",
  displayName: "A",
  role: "Member",
  createdAt: new Date().toISOString(),
};

function setLocation(pathname: string) {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { pathname, assign },
    writable: true,
    configurable: true,
  });
  return assign;
}

describe("handleUnauthorized", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clears the session and returns to login when a live session is rejected", async () => {
    useAuthStore.setState({ token: "live-token", user: user as never });
    const assign = setLocation("/mail");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({ error: "Token has been revoked." }),
      })
    );

    await expect(api.me()).rejects.toThrow();
    expect(useAuthStore.getState().token).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("leaves anonymous 401s alone so login errors stay on the form", async () => {
    useAuthStore.setState({ token: null, user: null });
    const assign = setLocation("/login");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({ error: "Invalid credentials." }),
      })
    );

    await expect(api.login({ identifier: "a", password: "wrong" })).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect when already on the login page", () => {
    useAuthStore.setState({ token: "stale-token", user: user as never });
    const assign = setLocation("/login");

    handleUnauthorized();

    expect(useAuthStore.getState().token).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing without a token", () => {
    useAuthStore.setState({ token: null, user: null });
    const assign = setLocation("/mail");

    handleUnauthorized();

    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores a stale 401 from a previous session on the request path", async () => {
    // User A had a slow request in flight, signed out, and user B signed in.
    // The old request finally 401s: the new session must survive it.
    let resolveFetch!: (value: unknown) => void;
    const seenAuth: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        seenAuth.push((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      })
    );
    const assign = setLocation("/mail");

    useAuthStore.setState({ token: "token-A", user: { ...user, id: "uA" } as never });
    const pending = api.me();
    useAuthStore.setState({ token: "token-B", user: { ...user, id: "uB" } as never });
    resolveFetch({
      status: 401,
      json: () => Promise.resolve({ error: "Token has been revoked." }),
    });

    await expect(pending).rejects.toThrow();
    expect(seenAuth).toEqual(["Bearer token-A"]);
    expect(useAuthStore.getState().token).toBe("token-B");
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores stale 401s on the download and upload paths too", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      )
    );
    const assign = setLocation("/mail");
    const fail401 = {
      status: 401,
      json: () => Promise.resolve({ error: "Token has been revoked." }),
      blob: () => Promise.resolve(new Blob()),
    };

    useAuthStore.setState({ token: "token-A", user: { ...user, id: "uA" } as never });
    const downloading = api.downloadAttachment("a1");
    const uploading = api.uploadAttachment(new File(["x"], "x.txt"));
    useAuthStore.setState({ token: "token-B", user: { ...user, id: "uB" } as never });
    for (const resolve of resolvers) resolve(fail401);

    await expect(downloading).rejects.toThrow();
    await expect(uploading).rejects.toThrow();
    expect(useAuthStore.getState().token).toBe("token-B");
    expect(assign).not.toHaveBeenCalled();
  });

  it("fires for a 401 that still carries the current token on every path", async () => {
    async function expectLogout(run: () => Promise<unknown>) {
      useAuthStore.setState({ token: "live-token", user: user as never });
      const assign = setLocation("/mail");
      await expect(run()).rejects.toThrow();
      expect(useAuthStore.getState().token).toBeNull();
      expect(assign).toHaveBeenCalledWith("/login");
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        json: () => Promise.resolve({ error: "Token has been revoked." }),
        blob: () => Promise.resolve(new Blob()),
      })
    );

    await expectLogout(() => api.me());
    await expectLogout(() => api.downloadAttachment("a1"));
    await expectLogout(() => api.uploadAttachment(new File(["x"], "x.txt")));
  });

  it("does not invalidate a new session from anonymous login errors", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["threads"], [{ id: "cached" }]);
    beginSession(qc, "fresh-token", user as never);
    // A fresh login starts with a cleared cache, never another user's rows.
    expect(qc.getQueryData(["threads"])).toBeUndefined();
    expect(useAuthStore.getState().token).toBe("fresh-token");
  });

  it("isolates the cache on every auth transition", () => {
    const qc = new QueryClient();
    qc.setQueryData(["threads"], [{ id: "old-user-row" }]);

    beginSession(qc, "token-1", user as never);
    expect(qc.getQueryData(["threads"])).toBeUndefined();

    qc.setQueryData(["threads"], [{ id: "user-1-row" }]);
    endSession(qc);
    expect(useAuthStore.getState().token).toBeNull();
    expect(qc.getQueryData(["threads"])).toBeUndefined();
  });
});
