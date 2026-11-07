import { describe, expect, it } from "vitest";
import type { MailDraftDto, ThreadDetailDto } from "@kompanion/types";
import {
  isComposeDirty,
  loadDraftToContext,
  replyContextFromThread,
  snapshotFromContext,
  type ComposeSnapshot,
} from "./compose-context";

function thread(): ThreadDetailDto {
  return {
    id: "t1",
    subject: "Invoice #1042",
    firstDate: null,
    lastDate: null,
    messageCount: 2,
    hasUnread: false,
    messages: [
      {
        id: 11,
        messageId: "<first@test.local>",
        folderName: "INBOX",
        folderSpecialUse: "Inbox",
        fromName: "Alice",
        fromAddr: "alice@test.local",
        toAddrs: null,
        ccAddrs: null,
        date: null,
        subject: "Invoice #1042",
        snippet: null,
        bodyText: "First",
        bodyHtml: null,
        flags: [],
        hasAttachments: false,
        attachmentMetaJson: null,
        attachments: [],
      },
      {
        id: 12,
        messageId: "<second@test.local>",
        folderName: "INBOX",
        folderSpecialUse: "Inbox",
        fromName: null,
        fromAddr: "bob@test.local",
        toAddrs: null,
        ccAddrs: null,
        date: null,
        subject: "Re: Invoice #1042",
        snippet: null,
        bodyText: "Second",
        bodyHtml: null,
        flags: [],
        hasAttachments: false,
        attachmentMetaJson: null,
        attachments: [],
      },
    ],
  };
}

describe("replyContextFromThread", () => {
  it("replies to the latest message with headers the server can resolve", () => {
    const ctx = replyContextFromThread("m1", thread());

    expect(ctx.mode).toBe("reply");
    expect(ctx.connectionId).toBe("m1");
    expect(ctx.replyToThreadId).toBe("t1");
    expect(ctx.replyToMessageId).toBe(12);
    expect(ctx.replyToAddress).toBe("bob@test.local");
    expect(ctx.prefillTo).toBe("bob@test.local");
    expect(ctx.prefillSubject).toBe("Re: Invoice #1042");
    expect(ctx.prefillBody).toBe("");
    expect(ctx.quotedHtml).toContain("Second");
  });
});

describe("loadDraftToContext", () => {
  function draft(overrides: Partial<MailDraftDto> = {}): MailDraftDto {
    return {
      id: "d1",
      mailboxConnectionId: "m9",
      replyToMessageId: 12,
      replyToAddress: "bob@test.local",
      references: JSON.stringify(["<first@test.local>"]),
      toAddrs: "bob@test.local",
      ccAddrs: null,
      bccAddrs: "hidden@test.local",
      subject: "Re: Invoice",
      bodyText: null,
      bodyHtml: "<p>resume me</p>",
      hasAttachments: true,
      attachmentMetaJson: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-02T00:00:00Z",
      replyToThreadId: "t1",
      skipBrandWrap: true,
      inReplyTo: "<second@test.local>",
      lastSend: null,
      rowVersion: 3,
      attachments: [
        {
          id: "a1",
          fileName: "note.txt",
          contentType: "text/plain",
          sizeBytes: 4,
          isInline: false,
          contentId: null,
        },
      ],
      ...overrides,
    };
  }

  it("resumes attachments, bcc, reply thread and brand opt-out", () => {
    const ctx = loadDraftToContext("m9", draft());

    expect(ctx.mode).toBe("reply");
    expect(ctx.draftId).toBe("d1");
    expect(ctx.replyToThreadId).toBe("t1");
    expect(ctx.replyToMessageId).toBe(12);
    expect(ctx.replyReferences).toEqual(["<first@test.local>"]);
    expect(ctx.prefillBcc).toBe("hidden@test.local");
    expect(ctx.skipBrandWrap).toBe(true);
    expect(ctx.prefillAttachments?.map((a) => a.id)).toEqual(["a1"]);
    expect(ctx.prefillBody).toContain("resume me");
  });

  it("treats a fresh draft as new and tolerates bad references JSON", () => {
    const ctx = loadDraftToContext(
      "m9",
      draft({ replyToMessageId: null, replyToThreadId: null, references: "not-json{" })
    );

    expect(ctx.mode).toBe("new");
    expect(ctx.replyToThreadId).toBeUndefined();
    expect(ctx.replyReferences).toBeNull();
  });
});

describe("isComposeDirty", () => {
  const opened: ComposeSnapshot = {
    to: "a@test.local",
    cc: "",
    bcc: "",
    subject: "S",
    body: "<p>hi</p>",
    skipBrandWrap: false,
    attachmentIds: "",
  };

  it("is clean for the opening snapshot", () => {
    expect(isComposeDirty(opened, { ...opened })).toBe(false);
  });

  it.each([
    ["to", { ...opened, to: "b@test.local" }],
    ["cc", { ...opened, cc: "c@test.local" }],
    ["bcc", { ...opened, bcc: "hidden@test.local" }],
    ["subject", { ...opened, subject: "Changed" }],
    ["body", { ...opened, body: "<p>edited</p>" }],
    ["skipBrandWrap", { ...opened, skipBrandWrap: true }],
    ["attachments added", { ...opened, attachmentIds: "a1" }],
  ])("detects a %s-only edit", (_label, current) => {
    expect(isComposeDirty(opened, current)).toBe(true);
  });

  it("detects an attachment removal", () => {
    const withFile: ComposeSnapshot = { ...opened, attachmentIds: "a1,a2" };
    expect(isComposeDirty(withFile, { ...withFile, attachmentIds: "a1" })).toBe(true);
  });

  it("builds the opening snapshot from context", () => {
    const snap = snapshotFromContext({
      mode: "reply",
      connectionId: "m1",
      prefillTo: "a@test.local",
      prefillBcc: "hidden@test.local",
      prefillBody: "<p>hi</p>",
      skipBrandWrap: true,
      prefillAttachments: [
        { id: "a1", fileName: "n", contentType: null, sizeBytes: 1, isInline: false, contentId: null },
      ],
    });
    expect(snap).toEqual({
      to: "a@test.local",
      cc: "",
      bcc: "hidden@test.local",
      subject: "",
      body: "<p>hi</p>",
      skipBrandWrap: true,
      attachmentIds: "a1",
    });
  });
});
