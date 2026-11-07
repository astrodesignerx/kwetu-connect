import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Heatmap, HourBars, Meter, Spark } from "./charts";
import { LedBar, StateBoard } from "./boards";
import { Segmented } from "./segmented";

afterEach(cleanup);

describe("Segmented keyboard navigation", () => {
  function Example() {
    const [value, setValue] = useState("week");
    return <Segmented label="Period" value={value} onChange={setValue} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }, { value: "year", label: "Year", panelId: "year-panel" }]} />;
  }
  it("uses roving focus, skips disabled tabs and wraps with arrow keys", () => {
    render(<Example />);
    const week = screen.getByRole("tab", { name: "Week" });
    const year = screen.getByRole("tab", { name: "Year" });
    week.focus();
    fireEvent.keyDown(week, { key: "ArrowRight" });
    expect(document.activeElement).toBe(year);
    expect(year.getAttribute("aria-selected")).toBe("true");
    expect(week.tabIndex).toBe(-1);
    expect(year.getAttribute("aria-controls")).toBe("year-panel");
    fireEvent.keyDown(year, { key: "ArrowRight" });
    expect(document.activeElement).toBe(week);
    fireEvent.keyDown(week, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(year);
    fireEvent.keyDown(year, { key: "Home" });
    expect(document.activeElement).toBe(week);
    fireEvent.keyDown(week, { key: "End" });
    expect(document.activeElement).toBe(year);
  });
  it("does not activate disabled options", () => {
    const change = vi.fn();
    render(<Segmented label="Unavailable" value="a" onChange={change} options={[{ value: "a", label: "A", disabled: true }]} />);
    fireEvent.click(screen.getByRole("tab"));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("tab").tabIndex).toBe(-1);
  });
});

describe("Chart and LED accessibility", () => {
  it("labels an empty Spark and clamps the meter", () => {
    render(<><Spark values={[]} label="No samples" /><Meter value={8} label="Strength" /></>);
    expect(screen.getByRole("img", { name: "No samples" })).toBeTruthy();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("4");
  });
  it("pads hourly input to 24 hours and highlights only the first peak", () => {
    render(<HourBars values={[1, 3, 3]} label="Hours" />);
    const bars = screen.getByRole("img", { name: "Hours" }).children;
    expect(bars).toHaveLength(24);
    expect(bars[1].className).toContain("peak");
    expect(bars[2].className).not.toContain("peak");
  });
  it("marks future cells empty even when the caller supplies activity", () => {
    render(<Heatmap values={{ "2026-10-23": 100 }} today="2026-10-22" weeks={1} label="Activity" />);
    expect(screen.getAllByRole("img", { name: /Future/ })).toHaveLength(3);
    expect(screen.getByRole("img", { name: "2026-10-23: Future" }).className).toContain("future");
  });
  it("provides one full ticker label and a loading status", () => {
    render(<><LedBar items={["Approval due", "Install tomorrow"]} /><StateBoard state="loading" /></>);
    expect(screen.getByRole("img", { name: "Approval due, Install tomorrow" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });
});
