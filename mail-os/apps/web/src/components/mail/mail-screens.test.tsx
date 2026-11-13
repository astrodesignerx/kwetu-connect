import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth-store";
import type { MailBrief } from "@/lib/signal-api";
import type { MailThreadSummary } from "@/lib/signal-mail";
import { MorningBrief } from "./morning-brief";
import { ConversationContext, ThreadStateControl } from "./conversation-context";
import { WaitingPill } from './waiting-pill';
import { ThreadList } from "./thread-list";

const { brief, setThreadState, flights, associations } = vi.hoisted(() => ({ brief: vi.fn(), setThreadState: vi.fn(), flights: vi.fn(), associations: vi.fn() }));
vi.mock("@/lib/signal-api", () => ({ signalApi: { brief, setThreadState, flights } }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

vi.mock("@/lib/api", () => ({ api: { getThreadAssociations: associations, listTemplates: vi.fn().mockResolvedValue([]), getTemplate: vi.fn() } }));
vi.mock("@/components/collaboration", () => ({ ThreadAssignee: () => <div>Assignee</div>, ThreadNotes: () => <div>Team notes</div> }));
vi.mock("@/components/thread-linker", () => ({ ThreadLinker: () => null }));

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
    expect(await screen.findByRole("heading", { name: "Morning brief" })).toBeTruthy();
    expect(screen.queryByText(/Habari/)).toBeNull();
    expect(screen.getByRole("link", { name: /Confirm installation/ }).getAttribute("href")).toBe("/mail?id=thread-1");
    expect(screen.getByLabelText("Waiting 2 hours 0 minutes")).toBeTruthy();
    expect(["unread", "waiting on you", "awaiting reply"].map((label) => screen.getByText(label).parentElement?.textContent))
      .toEqual(["7unread", "1waiting on you", "4awaiting reply"]);
    expect(screen.getByRole("link", { name: /Westlands/ }).getAttribute("href")).toBe("/clients/detail?id=client-1");
    expect(screen.getByText("1h 0m")).toBeTruthy();
    expect(screen.getByRole("img", { name: /days with replies only/ })).toBeTruthy();
  });

  it("labels a waiting pill in full units", () => {
    mount(<WaitingPill seconds={(5 * 24 + 11) * 3600} />);
    expect(screen.getByLabelText("Waiting 5 days 11 hours").textContent).toBe("5d 11h");
  });

  it("shows a recoverable brief error without fabricated metrics", async () => {
    brief.mockRejectedValue(new Error("offline"));
    mount(<MorningBrief />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("unread")).toBeNull();
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

  it("shows the On screen empty state without conversation stages", async () => {
    associations.mockResolvedValue({ company: null, projects: [] });
    mount(<ConversationContext threadId="t" replyState="ToReply" stateSince="2026-11-01" needsNudge={false} />);
    expect(await screen.findByText("No flights linked")).toBeTruthy();
    expect(screen.getAllByRole("heading").map((item) => item.textContent)).toEqual(["Client", "On screen", "Team", "Quick repliesFrom templates"]);
    expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
  });

  it("shows a running flight with dates and elapsed progress only", async () => {
    associations.mockResolvedValue({ company: null, projects: [{ id: "p", name: "Campaign" }] });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
    const day = 86_400_000;
    const startDate = new Date(Date.parse(today) - 2 * day).toISOString().slice(0, 10);
    const endDate = new Date(Date.parse(today) + 2 * day).toISOString().slice(0, 10);
    flights.mockResolvedValue([{ id: "f", siteName: "Westlands", startDate, endDate }]);
    mount(<ConversationContext threadId="t" replyState="ToReply" stateSince="2026-11-01" needsNudge={false} />);
    expect(await screen.findByText("On screen now")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Westlands: elapsed run" }).getAttribute("aria-valuenow")).toBe("0.4");
    expect(screen.queryByText(/Plays|00:00/)).toBeNull();
  });

  it("reopens a done thread and keeps failures visible", async () => {
    setThreadState.mockRejectedValue(new Error("offline"));
    mount(<ThreadStateControl threadId="t" replyState="Done" />);
    expect(screen.getByRole("button", { name: "Reopen" }).textContent).toBe("Done");
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(setThreadState).toHaveBeenCalledWith("t", "ToReply"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });
});
