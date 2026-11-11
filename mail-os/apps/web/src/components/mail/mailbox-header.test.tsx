import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MailboxStatusDto } from "@kompanion/types";
import { MailboxHeader, syncLabel } from "./mailbox-header";

const box = (id: string, email: string, syncState: MailboxStatusDto["syncState"] = "Syncing"): MailboxStatusDto => ({
  id, email, syncState, syncError: null, lastSyncCompletedAt: null, messageCount: 0, unreadCount: 0, imapHost: "", smtpHost: "",
});

afterEach(cleanup);

describe("MailboxHeader", () => {
  it("shows a single mailbox as plain text, not a button", () => {
    render(<MailboxHeader mailboxes={[box("a", "sales@example.test")]} currentId="a" onPick={vi.fn()} />);
    expect(screen.getByText("sales@example.test")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("switches between mailboxes from a menu", () => {
    const onPick = vi.fn();
    render(<MailboxHeader mailboxes={[box("a", "sales@example.test"), box("b", "info@example.test", "Error")]} currentId="a" onPick={onPick} />);
    const trigger = screen.getByRole("button", { name: /Switch mailbox/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /info@example.test/ }));
    expect(onPick).toHaveBeenCalledWith("b");
  });
});

describe("syncLabel", () => {
  it("words each sync state plainly", () => {
    expect(syncLabel({ syncState: "Error", lastSyncCompletedAt: null })).toBe("Sync stopped");
    expect(syncLabel({ syncState: "Backfilling", lastSyncCompletedAt: null })).toBe("Syncing");
    expect(syncLabel({ syncState: "Syncing", lastSyncCompletedAt: null })).toBe("Synced");
    expect(syncLabel({ syncState: "Syncing", lastSyncCompletedAt: "2020-01-02T08:00:00Z" })).toMatch(/^Synced on \d+ Jan 2020$/);
  });
});
