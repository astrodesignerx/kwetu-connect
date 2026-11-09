import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClientDirectory } from "./client-directory";
import type { ClientActivity } from "@/lib/signal-clients";

afterEach(cleanup);
const clients: ClientActivity[] = [
  { id: "cedar", name: "Cedar", domain: "cedar.test", projectCount: 2, threadCount: 4, boardsBooked: 2, waitingCount: 1, status: "WaitingOnUs", weeks: [{ startDate: "2026-10-19", conversations: 4 }] },
  { id: "acacia", name: "Acacia", domain: "acacia.test", projectCount: 0, threadCount: 0, boardsBooked: 0, waitingCount: 0, status: "AllReplied", weeks: [{ startDate: "2026-10-19", conversations: 0 }] },
];

describe("client directory", () => {
  it("changes between grid and list while retaining a domain search", () => {
    render(<ClientDirectory clients={clients} />);
    expect(document.getElementById("client-results")?.dataset.view).toBe("grid");
    fireEvent.change(screen.getByRole("textbox", { name: "Find a client or domain" }), { target: { value: "cedar.test" } });
    expect(screen.queryByText("Acacia")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    expect(document.getElementById("client-results")?.dataset.view).toBe("list");
    expect(screen.getByRole("tab", { name: "List" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Cedar")).toBeTruthy();
    expect(screen.queryByText("Acacia")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Grid" }));
    expect(document.getElementById("client-results")?.dataset.view).toBe("grid");
  });
  it("supports keyboard selection and a quiet no-match state", () => {
    render(<ClientDirectory clients={clients} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Grid" }), { key: "ArrowRight" });
    expect(document.getElementById("client-results")?.dataset.view).toBe("list");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "not present" } });
    expect(screen.getByText("No clients match that search")).toBeTruthy();
  });
});
