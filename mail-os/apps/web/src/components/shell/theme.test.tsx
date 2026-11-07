import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, ThemeToggle } from "./theme";
import { themeScript } from "./theme-init";

let systemDark = false;
let media: EventTarget;

function renderTheme() {
  return render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
}

beforeEach(() => {
  systemDark = false;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  media = new EventTarget();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

describe("Signal theme", () => {
  it("follows system changes until the user makes a persistent choice", () => {
    renderTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => { systemDark = true; media.dispatchEvent(new Event("change")); });
    expect(screen.getByRole("button", { name: "Switch to Day" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Switch to Day" }));
    expect(localStorage.getItem("ccos-theme")).toBe("light");
    act(() => { media.dispatchEvent(new Event("change")); });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores a toggled theme after remount and before hydration", () => {
    renderTheme();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Night" }));
    expect(localStorage.getItem("ccos-theme")).toBe("dark");
    cleanup();
    document.documentElement.classList.remove("dark");
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    renderTheme();
    expect(screen.getByRole("button", { name: "Switch to Day" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("still toggles when storage reads and writes throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Unavailable", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Unavailable", "SecurityError"); });
    systemDark = true;
    expect(() => new Function(themeScript)()).not.toThrow();
    renderTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Day" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Night" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies a stored choice received from another tab", () => {
    renderTheme();
    act(() => {
      localStorage.setItem("ccos-theme", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "ccos-theme", newValue: "dark" }));
    });
    expect(screen.getByRole("button", { name: "Switch to Day" })).toBeTruthy();
  });
});
