import { describe, expect, it, vi } from "vitest";
import type { MessageRow } from "@/app/mail/actions";

vi.mock("@/app/mail/actions", () => ({}));
import { listGroups, rowKey, threadRows } from "./MailList";
import { shortcut } from "./shortcuts";
import { placeholdRemotePictures } from "@/lib/mail/thread";

const row = (uid: number, subject: string, accountId = "a"): MessageRow & { accountId: string } => ({
  uid, subject, accountId, mailbox: "INBOX", from: { name: "", address: "x@y.z" }, to: [], cc: [], date: null, seen: true,
  flagged: false, answered: false, hasAttachments: false, messageId: null, thread: 1, snippet: "",
} as unknown as MessageRow & { accountId: string });

describe("Mail audit fixes", () => {
  it("keeps one row per conversation, so J and K never step onto a hidden message", () => {
    const rows = [row(3, "Re: Booking"), row(2, "Fwd: booking"), row(1, "Booking"), row(4, "Booking", "b"), row(5, "Invoice")];
    expect(threadRows(rows).map((r) => r.uid)).toEqual([3, 4, 5]);
  });

  it("orders J and K like the inbox: conversations needing a reply first", () => {
    const rows = [row(9, "Receipt"), row(8, "Question"), row(7, "Re: Question"), row(6, "Brief")];
    const waiting = new Set([rowKey(rows[1]), rowKey(rows[3])]);
    expect(listGroups(rows, true, waiting).map(([group, items]) => [group, items.map((r) => r.uid)]))
      .toEqual([["Needs your reply", [8, 6]], ["Other mail", [9]]]);
  });

  it("opens search with Ctrl K from a text field, while letter shortcuts stay paused", () => {
    const target = { tagName: "TEXTAREA", isContentEditable: false, closest: () => null } as unknown as EventTarget;
    expect(shortcut({ key: "k", target, ctrlKey: true, metaKey: false, altKey: false })).toBe("search");
    expect(shortcut({ key: "K", target, ctrlKey: false, metaKey: true, altKey: false })).toBe("search");
    expect(shortcut({ key: "k", target, ctrlKey: true, metaKey: false, altKey: true })).toBeNull();
    expect(shortcut({ key: "e", target, ctrlKey: false, metaKey: false, altKey: false })).toBeNull();
  });

  it("leaves message HTML untouched where no browser parser exists", () => {
    const html = '<img src="https://remote.test/pixel" alt="Logo">';
    expect(placeholdRemotePictures(html)).toBe(html);
  });
});
