import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import type { MailThreadDetail, MailThreadSummary } from "@/lib/signal-mail";
import { ToastProvider } from "@/components/shell/toast";
import MailPage from "./page";

const mocks = vi.hoisted(() => ({
  search: "", listeners: new Set<() => void>(),
  send: vi.fn(), state: vi.fn(), list: vi.fn(), detail: vi.fn(), overview: vi.fn(), read: vi.fn(), move: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mail",
  useSearchParams: () => new URLSearchParams(useSyncExternalStore((listener) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); }, () => mocks.search)),
  useRouter: () => ({ replace: (url: string) => { mocks.search = url.split("?")[1] ?? ""; mocks.listeners.forEach((listener) => listener()); } }),
}));
vi.mock("@/lib/signal-mail", async (original) => ({ ...await original<typeof import("@/lib/signal-mail")>(), signalMail: { listThreads: mocks.list, getThread: mocks.detail } }));
vi.mock("@/lib/api", () => ({ api: { sendMail: mocks.send, mailOverview: mocks.overview, setThreadRead: mocks.read, moveThread: mocks.move, triggerMailboxSync: vi.fn(), aiStatus: vi.fn().mockResolvedValue({ configured: false }) } }));
vi.mock("@/components/mail/morning-brief", () => ({ MorningBrief: () => <section aria-label="Morning brief">Your morning brief</section> }));
vi.mock("@/components/mail/conversation-context", async (original) => ({ ...await original<typeof import("@/components/mail/conversation-context")>(), ConversationChips: () => null, ConversationContext: () => <aside aria-label="Conversation context" /> }));
vi.mock("@/lib/signal-api", () => ({ signalApi: { setThreadState: mocks.state } }));
vi.mock("@/components/contact-card", () => ({ ContactDetails: () => null }));
vi.mock("@/components/attachments", () => ({ AttachmentList: () => null }));
vi.mock("@/components/ai-panel", () => ({ ThreadSummary: () => null, TONES: [] }));
vi.mock("@/components/compose", async (original) => ({ ...await original<typeof import("@/components/compose")>(), ComposeModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Compose"><button onClick={onClose}>Close compose</button></div> }));

const rows: MailThreadSummary[] = ["First", "Second"].map((name, index) => ({ id: `thread-${index}`, subject: `${name} conversation`, participants: name, snippet: "Preview", lastDate: "2026-11-07T08:00:00Z", firstDate: "2026-11-06T08:00:00Z", messageCount: 1, hasUnread: false, hasAttachments: false, replyState: "ToReply", stateSince: "2026-11-06T08:00:00Z", needsNudge: false, mailboxConnectionId: "mailbox", clientId: null, clientName: null }));
const detail = (id: string): MailThreadDetail => ({ ...rows.find((item) => item.id === id)!, messages: [{ id: id === "thread-0" ? 1 : 2, messageId: `<${id}@example.test>`, fromName: id === "thread-0" ? "First" : "Second", fromAddr: "sender@example.test", toAddrs: "studio@example.test", ccAddrs: null, date: "2026-11-07T08:00:00Z", subject: "Conversation", snippet: "Preview", bodyHtml: '<p>Message</p><img src="https://tracking.example.test/pixel.png" alt="Remote image">', bodyText: "Message", folderName: "INBOX", folderSpecialUse: "Inbox", flags: ["\\Seen"], hasAttachments: false, attachmentMetaJson: null, attachments: [] }] });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><ToastProvider><MailPage /></ToastProvider></QueryClientProvider>);
  return client;
}
const clients: QueryClient[] = [];
async function openFirst() { fireEvent.click(await screen.findByRole("button", { name: /First.*First conversation/ })); await screen.findByRole("heading", { name: "First conversation" }); }

describe("V2 mail behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.search = ""; mocks.listeners.clear();
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Object.defineProperty(document, "queryCommandState", { configurable: true, value: vi.fn(() => false) });
    useAuthStore.setState({ token: "fixture", hydrated: true });
    mocks.overview.mockResolvedValue({ mailboxes: [{ id: "mailbox", email: "studio@example.test", syncError: null }] });
    mocks.list.mockResolvedValue({ items: rows, total: rows.length });
    mocks.detail.mockImplementation(async (id: string) => detail(id));
    mocks.read.mockResolvedValue(undefined); mocks.move.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); clients.splice(0).forEach((client) => client.clear()); Reflect.deleteProperty(document, "queryCommandState"); vi.unstubAllGlobals(); });

  it("hides an archive immediately and sends only after five seconds", async () => {
    const client = mount(); await openFirst(); vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByRole("button", { name: /First.*First conversation/ })).toBeNull();
    expect(mocks.move).not.toHaveBeenCalled();
    // A live refetch must not bring the pending row back.
    await act(async () => { await client.invalidateQueries({ queryKey: ["threads"] }); });
    expect(screen.queryByRole("button", { name: /First.*First conversation/ })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4998); });
    expect(mocks.move).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive");
  });

  it.each(["button", "z"])("undoes with %s without sending and restores row order", async (method) => {
    mount(); await openFirst(); vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const undo = screen.getByRole("button", { name: "Undo" });
    undo.focus(); expect(document.activeElement).toBe(undo); expect(undo.tabIndex).toBe(0);
    if (method === "button") fireEvent.click(undo);
    else fireEvent.keyDown(window, { key: "z" });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(mocks.move).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /(?:First|Second).*conversation/ }).map((button) => button.textContent?.startsWith("First"))).toEqual([true, false]);
  });

  it("flushes the first move when another starts and restores a failed move", async () => {
    mocks.move.mockRejectedValueOnce(new Error("offline"));
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: /Second.*Second conversation/ }));
    await screen.findByRole("heading", { name: "Second conversation" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive"));
    expect(await screen.findByRole("button", { name: /First.*First conversation/ })).toBeTruthy();
    expect(screen.getByText("The mail action could not finish. Try again using its control.")).toBeTruthy();
    expect(mocks.move).toHaveBeenCalledTimes(1);
  });

  it("undoes a bulk archive without moving any conversations", async () => {
    mount(); await screen.findByText("First conversation"); vi.useFakeTimers();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all threads" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Archived 2 conversations")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /First.*First conversation/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByRole("button", { name: /First.*First conversation/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Second.*Second conversation/ })).toBeTruthy();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("restores a failed delayed move and removes its undo action", async () => {
    mocks.move.mockRejectedValueOnce(new Error("offline"));
    mount(); await openFirst(); vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    expect(mocks.move).toHaveBeenCalledWith("thread-0", "Trash");
    expect(screen.getByRole("button", { name: /First.*First conversation/ })).toBeTruthy();
    expect(screen.getByText("The mail action could not finish. Try again using its control.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("flushes a pending delete on leaving the page", async () => {
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    cleanup();
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("thread-0", "Trash"));
  });

  it("shows Sending then Sent before collapsing the reply", async () => {
    let resolveSend!: (value: unknown) => void;
    mocks.send.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const editor = screen.getByRole("textbox", { name: "Reply body" });
    editor.innerHTML = "<p>Reply text</p>"; fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    expect(await screen.findByRole("button", { name: /^Sending$/ })).toBeTruthy();
    vi.useFakeTimers();
    await act(async () => { resolveSend({}); await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("button", { name: /^Sent$/ })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
    expect(screen.getByRole("button", { name: /^Sent$/ })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(screen.queryByRole("textbox", { name: "Reply body" })).toBeNull();
  });

  it("keeps the reply and restores Send after a failed send", async () => {
    mocks.send.mockRejectedValue(new Error("Could not send the reply"));
    mount(); await openFirst(); fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    const editor = screen.getByRole("textbox", { name: "Reply body" });
    editor.innerHTML = "<p>Keep this reply</p>"; fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    expect(await screen.findByText("Could not send the reply")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Reply body" }).textContent).toBe("Keep this reply");
    expect(screen.getByRole("button", { name: /^Send$/ })).toBeTruthy();
  });

  it("keeps the list beside the reader and blocks remote images in a sandbox", async () => {
    mount(); await openFirst();
    expect(screen.getByRole("region", { name: "Messages" })).toBeTruthy();
    const frame = screen.getByTitle("Message 1");
    // Same origin lets the reader measure the message; scripts stay blocked.
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(screen.queryByRole("button", { name: /Expand message/ })).toBeNull();
    expect(frame.getAttribute("srcdoc")).toContain("img-src data:");
    fireEvent.click(screen.getByRole("button", { name: "Show images" }));
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).not.toContain("img-src data:");
  });

  it("marks read on open and leaves a marked-unread conversation closed", async () => {
    mocks.detail.mockResolvedValueOnce({ ...detail("thread-0"), hasUnread: true });
    mount(); await openFirst();
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("thread-0", true));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark unread" }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("thread-0", false));
    expect(new URLSearchParams(mocks.search).has("id")).toBe(false);
  });

  it("switches filters atomically and scopes bulk archive to visible rows", async () => {
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ folder: "unread" })));
    expect(new URLSearchParams(mocks.search).has("id")).toBe(false);
    await screen.findByRole("button", { name: /First.*First conversation/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all threads" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(mocks.move).not.toHaveBeenCalled();
    fireEvent(window, new Event("pagehide"));
    await waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
    expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive");
    expect(mocks.move).toHaveBeenCalledWith("thread-1", "Archive");
  });

  it("filters waiting conversations and keeps the Inbox heading", async () => {
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("tab", { name: "Waiting" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ folder: "waiting" })));
    expect(new URLSearchParams(mocks.search).has("id")).toBe(false);
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeTruthy();
  });

  it("marks done from the toolbar, shows Done and reopens", async () => {
    mocks.state.mockImplementation(async (_id: string, replyState: MailThreadDetail['replyState']) => {
      mocks.detail.mockResolvedValue({ ...detail("thread-0"), replyState });
      return { id: "thread-0", replyState };
    });
    mount(); await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(mocks.state).toHaveBeenCalledWith("thread-0", "Done"));
    const done = await screen.findByRole("button", { name: "Reopen" });
    expect(done.textContent).toBe("Done");
    expect(done.getAttribute("title")).toBe("Reopen");
    fireEvent.click(done);
    await waitFor(() => expect(mocks.state).toHaveBeenCalledWith("thread-0", "ToReply"));
    expect(await screen.findByRole("button", { name: "Mark done" })).toBeTruthy();
  });

  it("shows the sending address in the collapsed and open reply dock", async () => {
    mount(); await openFirst();
    expect(screen.getByText("from studio@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("From").parentElement?.textContent).toBe("Fromstudio@example.test");
  });

  it("preserves URL search and fetches the next page", async () => {
    mocks.search = "q=First";
    mocks.list.mockImplementation(async ({ page }: { page: number }) => ({ items: [rows[page]], total: 2 }));
    mount(); await screen.findByRole("button", { name: "Load more" });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ q: "First", page: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })));
    await screen.findByText("2 of 2");
  });

  it("supports j, k, x, e, u, r and c without handling typing as shortcuts", async () => {
    mount(); await screen.findByText("First conversation");
    fireEvent.keyDown(window, { key: "j" }); await screen.findByRole("heading", { name: "First conversation" });
    fireEvent.keyDown(window, { key: "j" }); await screen.findByRole("heading", { name: "Second conversation" });
    fireEvent.keyDown(window, { key: "k" }); await screen.findByRole("heading", { name: "First conversation" });
    fireEvent.keyDown(window, { key: "r" });
    const editor = await screen.findByRole("textbox", { name: "Reply body" });
    fireEvent.keyDown(editor, { key: "e" }); expect(mocks.move).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "x" }); await screen.findByText("1 selected");
    fireEvent.keyDown(window, { key: "e" }); fireEvent(window, new Event("pagehide")); await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive"));
    fireEvent.keyDown(window, { key: "j" }); await screen.findByRole("heading", { name: "First conversation" });
    fireEvent.keyDown(window, { key: "u" }); await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("thread-0", false));
    fireEvent.keyDown(window, { key: "c" }); await screen.findByRole("dialog", { name: "Compose" });
    fireEvent.keyDown(window, { key: "e" }); expect(mocks.move).toHaveBeenCalledTimes(1);
  });

  it("restores each thread's reply draft after switching conversations", async () => {
    mount(); await openFirst(); fireEvent.keyDown(window, { key: "r" });
    let editor = await screen.findByRole("textbox", { name: "Reply body" });
    editor.innerHTML = "<p>First draft</p>"; fireEvent.input(editor);
    fireEvent.keyDown(window, { key: "j" }); await screen.findByRole("heading", { name: "Second conversation" });
    fireEvent.keyDown(window, { key: "r" }); editor = await screen.findByRole("textbox", { name: "Reply body" });
    expect(editor.textContent).not.toContain("First draft");
    editor.innerHTML = "<p>Second draft</p>"; fireEvent.input(editor);
    fireEvent.keyDown(window, { key: "k" }); await screen.findByRole("heading", { name: "First conversation" });
    fireEvent.keyDown(window, { key: "r" }); editor = await screen.findByRole("textbox", { name: "Reply body" });
    expect(editor.textContent).toContain("First draft");
    expect(editor.textContent).not.toContain("Second draft");
  });

  it("offers recovery for errors and the mailbox connection for an empty overview", async () => {
    mocks.overview.mockResolvedValue({ mailboxes: [] }); mount();
    expect(await screen.findByRole("link", { name: "Connect a mailbox" })).toBeTruthy();
    cleanup(); mocks.overview.mockRejectedValue(new Error("offline")); mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
  it.each(["Member", "Admin"] as const)("uses the %s empty mailbox wording", async (role) => {
    useAuthStore.setState({ user: { id: "user", email: "user@test.local", username: "user", displayName: "User", role, createdAt: "" } });
    mocks.overview.mockResolvedValue({ mailboxes: [] }); mount();
    expect(await screen.findByText(role === "Member" ? "No mailbox shared with you yet" : "No mailbox connected")).toBeTruthy();
    expect(screen.getByText(role === "Member" ? "Ask an admin to share one, or connect your own" : "Connect your cPanel mailbox and your mail syncs into this workspace")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect a mailbox" })).toBeTruthy();
  });

  it("falls back and closes the reader when the current mailbox disappears", async () => {
    mocks.search = "m=mailbox&id=thread-0";
    const client = mount(); await screen.findByRole("heading", { name: "First conversation" });
    await act(async () => { client.setQueryData(["overview"], { mailboxes: [{ id: "remaining", email: "remaining@test.local", syncError: null }] }); });
    await waitFor(() => expect(new URLSearchParams(mocks.search).get("m")).toBe("remaining"));
    expect(new URLSearchParams(mocks.search).get("id")).toBeNull();
    expect(screen.queryByRole("heading", { name: "First conversation" })).toBeNull();
  });

});
