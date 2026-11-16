import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/shell/toast";
import { MailboxSharing } from "./sharing";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { adminMailboxAccess: mocks.load, adminSetMailboxAccess: mocks.save } }));
const people = [
  { userId: "member", displayName: "Amina", email: "amina@test.local", role: "Member", reason: "none" },
  { userId: "owner", displayName: "Owner", email: "owner@test.local", role: "Member", reason: "connected" },
  { userId: "admin", displayName: "Admin", email: "admin@test.local", role: "Admin", reason: "admin" },
];
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ToastProvider><MailboxSharing id="box" email="sales@test.local" userId="owner" /></ToastProvider></QueryClientProvider>);
}
describe("MailboxSharing", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(people); });
  afterEach(() => { cleanup(); client.clear(); });
  it("starts collapsed, locks implicit access and saves the chosen grants", async () => {
    mocks.save.mockImplementation(async () => { mocks.load.mockResolvedValue(people.map((person) => person.userId === "member" ? { ...person, reason: "granted" } : person)); });
    mount();
    await screen.findByText("Only admins and you");
    const toggle = screen.getByRole("button", { name: /Who can see this/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(toggle);
    const admin = screen.getByRole("checkbox", { name: /Admin admin@test.local Admin/ }) as HTMLInputElement;
    const owner = screen.getByRole("checkbox", { name: /Owner owner@test.local Connected it/ }) as HTMLInputElement;
    expect(admin.disabled && admin.checked && owner.disabled && owner.checked).toBe(true);
    admin.click(); owner.click();
    expect(admin.checked && owner.checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Amina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith("box", expect.arrayContaining(["admin", "owner", "member"])));
    await screen.findByText("Sharing updated for sales@test.local");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("restores saved ticks and shows feedback when saving fails", async () => {
    mocks.save.mockRejectedValue(new Error("Sharing could not be saved"));
    mount(); await screen.findByText("Only admins and you");
    fireEvent.click(screen.getByRole("button", { name: /Who can see this/ }));
    const member = screen.getByRole("checkbox", { name: /Amina/ }) as HTMLInputElement;
    fireEvent.click(member); expect(member.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Sharing could not be saved");
    expect(member.checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
  it("cancels an edit without saving", async () => {
    mount(); await screen.findByText("Only admins and you");
    fireEvent.click(screen.getByRole("button", { name: /Who can see this/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Amina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((screen.getByRole("checkbox", { name: /Amina/ }) as HTMLInputElement).checked).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
