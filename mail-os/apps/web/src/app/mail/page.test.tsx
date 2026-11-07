import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import type { MailThreadDetail, MailThreadSummary } from "@/lib/signal-mail";
import MailPage from "./page";

const mocks = vi.hoisted(() => ({
  search: "", listeners: new Set<() => void>(),
  list: vi.fn(), detail: vi.fn(), overview: vi.fn(), read: vi.fn(), move: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mail",
  useSearchParams: () => new URLSearchParams(useSyncExternalStore((listener) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); }, () => mocks.search)),
  useRouter: () => ({ replace: (url: string) => { mocks.search = url.split("?")[1] ?? ""; mocks.listeners.forEach((listener) => listener()); } }),
}));
vi.mock("@/lib/signal-mail", async (original) => ({ ...await original<typeof import("@/lib/signal-mail")>(), signalMail: { listThreads: mocks.list, getThread: mocks.detail } }));
vi.mock("@/lib/api", () => ({ api: { mailOverview: mocks.overview, setThreadRead: mocks.read, moveThread: mocks.move, triggerMailboxSync: vi.fn(), aiStatus: vi.fn().mockResolvedValue({ configured: false }) } }));
vi.mock("@/components/mail/morning-brief", () => ({ MorningBrief: () => <section aria-label="Morning brief">Your morning brief</section> }));
vi.mock("@/components/mail/conversation-context", () => ({ ConversationChips: () => null, ConversationContext: () => <aside aria-label="Conversation context" /> }));
vi.mock("@/components/contact-card", () => ({ ContactDetails: () => null }));
vi.mock("@/components/attachments", () => ({ AttachmentList: () => null }));
vi.mock("@/components/ai-panel", () => ({ ThreadSummary: () => null, TONES: [] }));
vi.mock("@/components/compose", async (original) => ({ ...await original<typeof import("@/components/compose")>(), ComposeModal: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Compose"><button onClick={onClose}>Close compose</button></div> }));

const rows: MailThreadSummary[] = ["First", "Second"].map((name, index) => ({ id: `thread-${index}`, subject: `${name} conversation`, participants: name, snippet: "Preview", lastDate: "2026-11-07T08:00:00Z", firstDate: "2026-11-06T08:00:00Z", messageCount: 1, hasUnread: false, hasAttachments: false, replyState: "ToReply", stateSince: "2026-11-06T08:00:00Z", needsNudge: false, mailboxConnectionId: "mailbox", clientId: null, clientName: null }));
const detail = (id: string): MailThreadDetail => ({ ...rows.find((item) => item.id === id)!, messages: [{ id: id === "thread-0" ? 1 : 2, messageId: `<${id}@example.test>`, fromName: id === "thread-0" ? "First" : "Second", fromAddr: "sender@example.test", toAddrs: "studio@example.test", ccAddrs: null, date: "2026-11-07T08:00:00Z", subject: "Conversation", snippet: "Preview", bodyHtml: '<p>Message</p><img src="https://tracking.example.test/pixel.png" alt="Remote image">', bodyText: "Message", folderName: "INBOX", folderSpecialUse: "Inbox", flags: ["\\Seen"], hasAttachments: false, attachmentMetaJson: null, attachments: [] }] });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MailPage /></QueryClientProvider>);
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
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); Reflect.deleteProperty(document, "queryCommandState"); vi.unstubAllGlobals(); });

  it("keeps the list beside the reader and blocks remote images in a sandbox", async () => {
    mount(); await openFirst();
    expect(screen.getByRole("region", { name: "Messages" })).toBeTruthy();
    const frame = screen.getByTitle("Message 1");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("img-src data:");
    fireEvent.click(screen.getByRole("button", { name: "Show images" }));
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).not.toContain("img-src data:");
  });

  it("marks read on open and leaves a marked-unread conversation closed", async () => {
    mocks.detail.mockResolvedValueOnce({ ...detail("thread-0"), hasUnread: true });
    mount(); await openFirst();
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("thread-0", true));
    fireEvent.click(screen.getByRole("button", { name: "Mark unread" }));
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
    await waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
    expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive");
    expect(mocks.move).toHaveBeenCalledWith("thread-1", "Archive");
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
    fireEvent.keyDown(window, { key: "e" }); await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("thread-0", "Archive"));
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
});
