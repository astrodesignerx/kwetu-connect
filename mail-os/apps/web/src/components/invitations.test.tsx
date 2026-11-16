import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvitationsPanel } from "./invitations";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
const mailboxes = [
  { id: "sales", email: "sales@test.local", isActive: true },
  { id: "info", email: "info@test.local", isActive: true },
];
vi.mock("@/lib/api", () => ({ api: {
  listMailboxes: async () => mailboxes,
  mailOverview: async () => ({ mailboxes: [{ id: "sales", syncState: "Syncing" }, { id: "info", syncState: "Error" }] }),
  adminListInvitations: async () => [{ id: "old", email: "old@test.local", role: "Member", mailboxIds: ["info"], expiresAt: "2027-01-01T00:00:00Z", status: "pending" }],
  adminCreateInvitation: mocks.create,
} }));
let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><InvitationsPanel /></QueryClientProvider>);
}
describe("InvitationsPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { cleanup(); client.clear(); });
  it.each([true, false])("submits selected mailboxes and retains the link for emailSent=%s", async (emailSent) => {
    mocks.create.mockResolvedValue({ invitation: { id: "new", email: "person@test.local" }, token: "creation-token", emailSent });
    mount();
    const choice = await screen.findByRole("checkbox", { name: "info@test.local" }) as HTMLInputElement;
    expect(choice.checked).toBe(false);
    expect(screen.getByText("They will see no mail until you share a mailbox with them.")).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText("Send the invitation from") as HTMLSelectElement).value).toBe("sales"));
    fireEvent.click(choice);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "person@test.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ email: "person@test.local", role: "Member", mailboxIds: ["info"], sendFromMailboxId: "sales" }));
    expect(await screen.findByText(emailSent ? "Invitation emailed to person@test.local" : "The email could not be sent. Copy the link below.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy link" }).length).toBeGreaterThan(0);
    expect(screen.getByText("creation-token")).toBeTruthy();
    expect(screen.getByText("Will see info@test.local")).toBeTruthy();
  });
  it("hides mailboxes for admins and supports copying without email", async () => {
    mocks.create.mockResolvedValue({ invitation: { id: "new", email: "person@test.local" }, token: "token", emailSent: false });
    mount(); await screen.findByRole("checkbox", { name: "info@test.local" });
    fireEvent.click(screen.getByRole("checkbox", { name: "info@test.local" }));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Admin" } });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Admins see every mailbox.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Send the invitation from"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "person@test.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ email: "person@test.local", role: "Admin", mailboxIds: [], sendFromMailboxId: undefined }));
  });
});
