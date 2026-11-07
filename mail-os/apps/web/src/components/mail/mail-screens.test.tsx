import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import type { MailBrief } from "@/lib/signal-api";
import type { MailThreadSummary } from "@/lib/signal-mail";
import { MorningBrief } from "./morning-brief";
import { ThreadStateControl } from "./conversation-context";
import { ThreadList } from "./thread-list";

const { brief, setThreadState } = vi.hoisted(() => ({ brief: vi.fn(), setThreadState: vi.fn() }));
vi.mock("@/lib/signal-api", () => ({ signalApi: { brief, setThreadState } }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}>{element}</QueryClientProvider>), client };
}

describe("Signal mail screens", () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks();
    useAuthStore.setState({ token: "test", user: { id: "u", username: "amina", displayName: "Amina Otieno", email: "a@test.local", role: "Member", createdAt: "" } });
  });

  it("renders the real personal waiting list, organisation metrics and flights from a mocked brief", async () => {
    const response: MailBrief = {
      unreadCount: 7, waitingOnMe: [{ id: "thread-1", subject: "Confirm installation", stateSince: "2026-10-22T06:00:00Z", waitingSeconds: 7200, needsNudge: false }],
      awaitingCount: 4, upcomingFlights: [{ id: "flight-1", projectId: "project-1", clientId: "client-1", client: "Actual client", siteName: "Westlands", startDate: "2026-10-26", endDate: "2026-11-02" }],
      firstReply: { workingDays: 7, count: 3, medianSeconds: 3600, daily: [{ date: "2026-10-21", count: 0, medianSeconds: null }, { date: "2026-10-22", count: 3, medianSeconds: 3600 }] },
    };
    brief.mockResolvedValue(response);
    mount(<MorningBrief />);
    expect(await screen.findByRole("heading", { name: "Your morning brief" })).toBeTruthy();
    expect(screen.queryByText(/Habari/)).toBeNull();
    expect(screen.getByRole("link", { name: /Confirm installation/ }).getAttribute("href")).toBe("/mail?id=thread-1");
    expect(screen.getByText("Waiting 2h 0m")).toBeTruthy();
    expect(screen.getByRole("img", { name: /7 UNREAD, 1 WAITING ON YOU, 4 AWAITING REPLY/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Westlands/ }).getAttribute("href")).toBe("/clients/detail?id=client-1");
    expect(screen.getByText("1h 0m")).toBeTruthy();
    expect(screen.getByRole("img", { name: /days with replies only/ })).toBeTruthy();
  });

  it("shows a recoverable brief error without fabricated metrics", async () => {
    brief.mockRejectedValue(new Error("offline"));
    mount(<MorningBrief />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/UNREAD/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("groups by reply state before date, independently of unread flags", () => {
    const make = (id: string, replyState: MailThreadSummary["replyState"], lastDate: string, hasUnread: boolean): MailThreadSummary => ({
      id, replyState, lastDate, hasUnread, subject: id, participants: "Person", snippet: "Preview", messageCount: 1, firstDate: lastDate,
      hasAttachments: false, stateSince: lastDate, needsNudge: false, mailboxConnectionId: "m", clientId: null, clientName: null,
    });
    const today = new Date().toISOString();
    const items = [make("Old read reply", "ToReply", "2020-01-01T12:00:00Z", false), make("Today done", "Done", today, false), make("Old unread awaiting", "Awaiting", "2020-01-01T12:00:00Z", true)];
    mount(<ThreadList items={items} loading={false} selectedId={null} onSelect={vi.fn()} selection={new Set()} onToggleSelect={vi.fn()} total={3} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(within(screen.getByRole("region", { name: "Needs your reply" })).getByText("Old read reply")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Today" })).getByText("Today done")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Earlier" })).getByText("Old unread awaiting")).toBeTruthy();
  });

  it("marks done through the existing state endpoint and refreshes the brief", async () => {
    setThreadState.mockResolvedValue({ id: "t", replyState: "Done" });
    const { client } = mount(<ThreadStateControl threadId="t" replyState="ToReply" />);
    const invalidation = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(setThreadState).toHaveBeenCalledWith("t", "Done"));
    await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ["mail-brief"] }));
  });

  it("reopens a done thread and keeps failures visible", async () => {
    setThreadState.mockRejectedValue(new Error("offline"));
    mount(<ThreadStateControl threadId="t" replyState="Done" />);
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(setThreadState).toHaveBeenCalledWith("t", "ToReply"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });
});
