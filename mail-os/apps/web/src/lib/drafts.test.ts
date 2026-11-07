import { describe, expect, it } from "vitest";
import type { MailDraftDto } from "@kompanion/types";
import { combineDraftLists } from "./drafts";

function draft(id: string, mailbox: string, updatedAt: string): MailDraftDto {
  return {
    id,
    mailboxConnectionId: mailbox,
    replyToMessageId: null,
    replyToAddress: null,
    references: null,
    toAddrs: "r@test.local",
    ccAddrs: null,
    bccAddrs: null,
    subject: id,
    bodyText: "b",
    bodyHtml: null,
    hasAttachments: false,
    attachmentMetaJson: null,
    createdAt: updatedAt,
    updatedAt,
    replyToThreadId: null,
    skipBrandWrap: false,
    inReplyTo: null,
    attachments: [],
    lastSend: null,
    rowVersion: 1,
  };
}

describe("combineDraftLists", () => {
  it("merges every mailbox newest-first and keeps each draft's own mailbox", () => {
    const merged = combineDraftLists([
      [draft("a", "m1", "2026-10-01T10:00:00Z")],
      [
        draft("b", "m2", "2026-10-03T10:00:00Z"),
        draft("c", "m2", "2026-10-02T10:00:00Z"),
      ],
    ]);

    expect(merged.map((d) => d.id)).toEqual(["b", "c", "a"]);
    expect(merged.map((d) => d.mailboxConnectionId)).toEqual(["m2", "m2", "m1"]);
  });

  it("returns an empty list when no mailbox has drafts", () => {
    expect(combineDraftLists([[], []])).toEqual([]);
  });
});
