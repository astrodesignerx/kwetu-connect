import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoginPage from "./page";

const mocks = vi.hoisted(() => ({ request: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/api", () => ({ api: { login: vi.fn(), requestPasswordReset: mocks.request } }));

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><LoginPage /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sign in", () => {
  it.each(["real@test.local", "nobody@test.local"])("asks an admin and answers the same way for %s", async (identifier) => {
    mocks.request.mockResolvedValue({ message: "accepted" });
    mount();
    fireEvent.change(document.getElementById("identifier")!, { target: { value: identifier } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    const field = document.getElementById("reset-identifier") as HTMLInputElement;
    expect(field.value).toBe(identifier);
    fireEvent.click(screen.getByRole("button", { name: "Ask an admin to reset it" }));
    expect(await screen.findByText("If that account exists, your admins have been asked. They will give you a new password.")).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith(identifier);
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("offers the invitation link and no dead-end password sentence", () => {
    mount();
    expect(screen.getByRole("link", { name: "I have an invitation" })).toBeTruthy();
    expect(screen.queryByText(/An admin can reset it for you/)).toBeNull();
  });
});
