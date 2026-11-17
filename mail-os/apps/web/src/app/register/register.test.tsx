import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RegisterPage from "./page";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), search: "invite=abc" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock("@/lib/api", () => ({ api: { register: vi.fn(), registrationMode: async () => ({ mode: "invite" }), invitationPreview: mocks.preview } }));

function mount() {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><RegisterPage /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.search = "invite=abc"; });

describe("Register from an invitation", () => {
  it("greets the person, fills the address and hides the code", async () => {
    mocks.preview.mockResolvedValue({ email: "brian@test.local", invitedByName: "Amina", role: "Member", mailboxes: ["sales@test.local", "info@test.local"], expiresAt: "2027-01-01T00:00:00Z" });
    mount();
    expect(await screen.findByRole("heading", { name: "Join Kwetu OS" })).toBeTruthy();
    expect(screen.getByText("Amina invited you. You will see sales@test.local and info@test.local.")).toBeTruthy();
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("brian@test.local");
    expect(email.readOnly).toBe(true);
    expect(screen.queryByLabelText("Invitation code")).toBeNull();
    expect(mocks.preview).toHaveBeenCalledWith("abc");
  });

  it("refuses a dead link with no form", async () => {
    mocks.preview.mockRejectedValue(new Error("Not found"));
    mount();
    expect(await screen.findByText("This invitation has expired or was replaced. Ask your admin for a new one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("works as before without a link", async () => {
    mocks.search = "";
    mount();
    expect(await screen.findByLabelText("Invitation code")).toBeTruthy();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
