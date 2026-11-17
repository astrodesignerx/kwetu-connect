import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminUsersPage from "./page";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), dismiss: vi.fn(), requests: vi.fn() }));
vi.mock("@/lib/use-require-auth", () => ({ useRequireAuth: () => ({ ready: true, user: { id: "me", role: "Admin" } }) }));
vi.mock("@/components/invitations", () => ({ InvitationsPanel: () => null }));
vi.mock("@/lib/api", () => ({ api: {
  adminListUsers: async () => [
    { id: "me", displayName: "Amina", email: "amina@test.local", role: "Admin", mailboxCount: 1, lastLoginAt: null },
    { id: "brian", displayName: "Brian", email: "brian@test.local", role: "Member", mailboxCount: 0, lastLoginAt: null },
  ],
  adminUpdateRole: vi.fn(),
  adminPasswordResetRequests: mocks.requests,
  adminResetPassword: mocks.reset,
  adminDismissPasswordReset: mocks.dismiss,
} }));

const dialog = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal"),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close"),
};
beforeEach(() => {
  // jsdom has no modal dialogs; these stubs expose the open state the dialog relies on.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  mocks.requests.mockResolvedValue([{ id: "req", userId: "brian", displayName: "Brian", email: "brian@test.local", createdAt: "2026-11-16T08:00:00Z" }]);
});
afterEach(() => {
  cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();
  if (dialog.showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", dialog.showModal);
  if (dialog.close) Object.defineProperty(HTMLDialogElement.prototype, "close", dialog.close);
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminUsersPage /></QueryClientProvider>);
}

describe("People page password resets", () => {
  it("marks the request, resets once and forgets the password on close", async () => {
    mocks.reset.mockResolvedValue({ newPassword: "abcde-fghij-kmnop-qrstu" });
    mount();
    expect(await screen.findByText("Asked for a new password")).toBeTruthy();
    const resetButtons = screen.getAllByRole("button", { name: "Reset password" });
    expect(resetButtons).toHaveLength(1); // never offered for yourself
    fireEvent.click(resetButtons[0]);
    const dialogEl = document.querySelector("dialog")!;
    expect(within(dialogEl).getByText("They will be signed out everywhere.")).toBeTruthy();
    fireEvent.click(within(dialogEl).getByRole("button", { name: "Reset password", hidden: true }));
    expect(await within(dialogEl).findByText("abcde-fghij-kmnop-qrstu")).toBeTruthy();
    expect(mocks.reset).toHaveBeenCalledWith("brian");
    fireEvent.click(within(dialogEl).getByRole("button", { name: "Done", hidden: true }));
    await waitFor(() => expect(screen.queryByText("abcde-fghij-kmnop-qrstu")).toBeNull());
  });

  it("dismisses a request", async () => {
    mocks.dismiss.mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith("req"));
  });
});
