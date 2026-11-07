import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlightForm } from "./flight-form";
import { signalApi } from "@/lib/signal-api";

vi.mock("@/lib/signal-api", () => ({ signalApi: { createFlight: vi.fn(), updateFlight: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("flight form", () => {
  it("prevents a reversed date range reaching the API", () => {
    render(<QueryClientProvider client={new QueryClient()}><FlightForm projects={[{ id: "project", name: "Launch" }]} onDone={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Westlands" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-11-01" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save flight" }).closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("End date must be on or after start date.");
    expect(signalApi.createFlight).not.toHaveBeenCalled();
  });
  it("updates the original flight and allows equal start and end dates", async () => {
    const flight = { id: "flight", projectId: "project", siteName: "Westlands", startDate: "2026-11-02", endDate: "2026-11-02" };
    vi.mocked(signalApi.updateFlight).mockResolvedValue(flight);
    const onDone = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><FlightForm projects={[{ id: "project", name: "Launch" }]} initial={flight} onDone={onDone} /></QueryClientProvider>);
    expect((screen.getByLabelText("Project") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Save flight" }).closest("form")!);
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(signalApi.updateFlight).toHaveBeenCalledWith("project", "flight", { siteName: "Westlands", startDate: "2026-11-02", endDate: "2026-11-02" });
    expect(signalApi.createFlight).not.toHaveBeenCalled();
  });
});
