import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiError } from "@kompanion/api-client";
import {
  clearStoredIdentity,
  loadStoredIdentity,
  snapshotSendContent,
  storeIdentity,
  useSendIdentity,
} from "./send-identity";

function content(body = "<p>hi</p>") {
  return snapshotSendContent({
    to: "r@test.local",
    cc: "",
    bcc: "",
    subject: "S",
    body,
    attachmentIds: [],
    skipBrandWrap: false,
  });
}

describe("send identity storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("round-trips through storage and clears", () => {
    expect(loadStoredIdentity("d1")).toBeNull();
    storeIdentity("d1", { key: "k1", outcome: "uncertain", failedContent: null });
    expect(loadStoredIdentity("d1")).toEqual({ key: "k1", outcome: "uncertain", failedContent: null });
    clearStoredIdentity("d1");
    expect(loadStoredIdentity("d1")).toBeNull();
  });

  it("ignores a missing composition id", () => {
    expect(loadStoredIdentity(null)).toBeNull();
    storeIdentity(null, { key: "k", outcome: "none", failedContent: null });
    clearStoredIdentity(null);
  });
});

describe("useSendIdentity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts from the server record when present", () => {
    const { result } = renderHook(() => useSendIdentity("d1", "server-key", "Uncertain"));
    expect(result.current.key).toBe("server-key");
    expect(result.current.outcome).toBe("uncertain");
    expect(result.current.canSend).toBe(false);
  });

  it("survives a remount with the same composition", () => {
    const first = renderHook(() => useSendIdentity("d1"));
    const key = first.result.current.key;
    first.unmount();

    const second = renderHook(() => useSendIdentity("d1"));
    expect(second.result.current.key).toBe(key);
  });

  it("mints a new key when content changes after a safe failure", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));
    const before = result.current.key;

    act(() => {
      const resolution = result.current.noteError(new ApiError(400, "Bad"), content());
      expect(resolution.action).toBe("send");
      expect(resolution.key).toBe(before);
    });
    expect(result.current.outcome).toBe("safe_failure");

    let next = "";
    act(() => {
      next = result.current.keyForSend(content("<p>edited</p>"));
    });
    expect(next).not.toBe(before);
    expect(result.current.outcome).toBe("none");
  });

  it("reuses the key for an unchanged safe retry", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));
    const before = result.current.key;

    act(() => {
      result.current.noteError(new ApiError(404, "Gone"), content());
    });
    let next = "";
    act(() => {
      next = result.current.keyForSend(content());
    });
    expect(next).toBe(before);
  });

  it("treats network failures as uncertain and blocks until explicit reset", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));

    act(() => {
      const action = result.current.noteError(new TypeError("fetch failed"), content());
      expect(action.action).toBe("blocked");
    });
    expect(result.current.canSend).toBe(false);

    act(() => {
      result.current.resetWithNewKey();
    });
    expect(result.current.canSend).toBe(true);
    expect(result.current.outcome).toBe("none");
  });

  it("mints a fresh identity on safe content mismatch and blocks on delivered", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));
    const before = result.current.key;

    let key = "";
    act(() => {
      const resolution = result.current.noteError(
        new ApiError(409, "Changed", "failed_changed"),
        content()
      );
      expect(resolution.action).toBe("send");
      key = resolution.key;
    });
    expect(key).not.toBe(before);
    expect(result.current.canSend).toBe(true);

    act(() => {
      const resolution = result.current.noteError(
        new ApiError(409, "Delivered", "already_sent"),
        content()
      );
      expect(resolution.action).toBe("blocked");
    });
    expect(result.current.canSend).toBe(false);
  });

  it("treats typed not_sent as a safe failure on the same key", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));
    const before = result.current.key;

    let key = "";
    act(() => {
      const resolution = result.current.noteError(
        new ApiError(502, "Down", "not_sent"),
        content()
      );
      expect(resolution.action).toBe("send");
      key = resolution.key;
    });
    expect(key).toBe(before);
    expect(result.current.outcome).toBe("safe_failure");
  });

  it("blocks in-progress operations without rotating", () => {
    const { result } = renderHook(() => useSendIdentity("d1"));
    const before = result.current.key;

    act(() => {
      const resolution = result.current.noteError(
        new ApiError(409, "Busy", "in_progress"),
        content()
      );
      expect(resolution.action).toBe("blocked");
    });
    expect(result.current.key).toBe(before);
    expect(result.current.canSend).toBe(false);
  });

  it("rotates after edits against a reopened safe failure", () => {
    const failedContent = content();
    const { result } = renderHook(() =>
      useSendIdentity("d1", "server-key", "Failed", failedContent)
    );
    expect(result.current.key).toBe("server-key");
    expect(result.current.outcome).toBe("safe_failure");

    let next = "";
    act(() => {
      next = result.current.keyForSend(content("<p>edited after reload</p>"));
    });
    expect(next).not.toBe("server-key");
    expect(result.current.outcome).toBe("none");

    // Unchanged content reuses the recorded key for a safe retry.
    const { result: same } = renderHook(() =>
      useSendIdentity("d2", "server-key-2", "Failed", failedContent)
    );
    let kept = "";
    act(() => {
      kept = same.current.keyForSend(failedContent);
    });
    expect(kept).toBe("server-key-2");
  });

  it("keeps uncertain identity across reloads", () => {
    const first = renderHook(() => useSendIdentity("d1"));
    act(() => {
      first.result.current.noteError(new ApiError(502, "Maybe", "uncertain"), content());
    });
    first.unmount();

    const second = renderHook(() => useSendIdentity("d1"));
    expect(second.result.current.outcome).toBe("uncertain");
    expect(second.result.current.canSend).toBe(false);
    expect(second.result.current.key).toBe(first.result.current.key);
  });
});
