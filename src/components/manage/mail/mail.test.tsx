import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MessageRow, ThreadMessage } from "@/app/manage/(staff)/mail/actions";

vi.mock("@/app/manage/(staff)/mail/actions", () => ({
  connectMailbox: vi.fn(), disconnectMailbox: vi.fn(), mailAct: vi.fn(), mailFolders: vi.fn(), mailList: vi.fn(), mailThread: vi.fn(), mailSend: vi.fn(), myMailboxes: vi.fn(),
}));

import MailDesk from "./MailDesk";
import MailList from "./MailList";
import MailReader from "./MailReader";
import { dayGroup, initials, listTime, quoteBlock, replySubject, splitAddresses, textToHtml, waitingFor } from "./mail-format";

const NOW = new Date("2026-11-17T15:00:00Z"); // 18:00 in Nairobi
const row = (over: Partial<MessageRow>): MessageRow => ({
  uid: 1, mailbox: "INBOX", from: { name: "Brian Otieno", address: "brian@client.test" }, to: [{ name: "", address: "sales@example.test" }],
  subject: "Eldoret screen", date: "2026-11-17T12:00:00Z", seen: true, flagged: false, answered: false, hasAttachments: false, messageId: "<1@x>", thread: 1, ...over,
});

describe("mail formatting", () => {
  it("shows times in Nairobi and groups by day", () => {
    expect(listTime("2026-11-17T12:05:00Z", NOW)).toBe("15:05");
    expect(listTime("2026-06-29T08:00:00Z", NOW)).toBe("29 Jun");
    expect(listTime("2025-06-29T08:00:00Z", NOW)).toBe("29 Jun 2025");
    expect(dayGroup("2026-11-17T05:00:00Z", NOW)).toBe("Today");
    expect(dayGroup("2026-11-16T12:00:00Z", NOW)).toBe("Yesterday");
    expect(dayGroup("2026-11-12T12:00:00Z", NOW)).toBe("This week");
    expect(dayGroup("2026-10-01T12:00:00Z", NOW)).toBe("Earlier");
  });

  it("times only unanswered mail from people, within a fortnight", () => {
    expect(waitingFor("2026-11-17T12:00:00Z", false, "brian@client.test", NOW)).toBe("3h");
    expect(waitingFor("2026-11-14T15:00:00Z", false, "brian@client.test", NOW)).toBe("3d");
    expect(waitingFor("2026-11-17T12:00:00Z", true, "brian@client.test", NOW)).toBeNull();
    expect(waitingFor("2026-11-17T12:00:00Z", false, "no-reply@bank.test", NOW)).toBeNull();
    expect(waitingFor("2026-11-17T14:30:00Z", false, "brian@client.test", NOW)).toBeNull();
    expect(waitingFor("2026-10-01T12:00:00Z", false, "brian@client.test", NOW)).toBeNull();
  });

  it("writes safe email HTML and reply subjects", () => {
    expect(textToHtml("Hi <b>Brian</b>,\nThanks.\n\nRegards")).toBe("<p>Hi &lt;b&gt;Brian&lt;/b&gt;,<br>Thanks.</p><p>Regards</p>");
    expect(replySubject("RE: Re: Quote", "reply")).toBe("Re: Quote");
    expect(replySubject("Quote", "forward")).toBe("Fwd: Quote");
    expect(splitAddresses("a@x.test, b@y.test; c@z.test")).toEqual(["a@x.test", "b@y.test", "c@z.test"]);
    expect(initials("Brian Otieno", "")).toBe("BO");
    expect(initials("", "sales@example.test")).toBe("S");
    expect(quoteBlock({ from: [{ name: "<Brian>", address: "b@x.test" }], date: null, html: null, text: "a < b" })).toContain("&lt;Brian&gt; wrote:");
  });
});

describe("Mail page", () => {
  it("asks for a mailbox first, with the webmail hint and no other gold action", () => {
    const html = renderToStaticMarkup(<MailDesk initialAccounts={[]} initialQuery="" />);
    expect(html).toContain("Connect your mailbox");
    expect(html).toContain("Use the address and password you sign in to webmail with.");
    expect(html).toContain("Only you see this mailbox. The password is stored encrypted.");
    expect(html.match(/mg-primary/g)).toHaveLength(1);
  });

  it("opens on the inbox of the first mailbox with New email as the one gold action", () => {
    const html = renderToStaticMarkup(<MailDesk initialAccounts={[{ id: "a", label: "sales@example.test", email: "sales@example.test" }]} initialQuery="quote" />);
    expect(html).toContain("<h1 class=\"mg-heading\">Mail</h1>");
    expect(html).toContain("sales@example.test");
    expect(html).toContain("Results for &ldquo;quote&rdquo;".replace("&ldquo;", "“").replace("&rdquo;", "”"));
    expect(html).toContain("aria-current=\"true\"");
    expect(html.match(/mg-primary/g)).toHaveLength(1);
  });

  it("lists mail under day headings, bold when unread, with ember waiting times in the inbox only", () => {
    vi.useFakeTimers({ now: NOW });
    const items = [row({ uid: 2, seen: false, hasAttachments: true, thread: 3 }), row({ uid: 1, date: "2026-11-10T08:00:00Z", answered: true })];
    const inbox = renderToStaticMarkup(<MailList items={items} selected="INBOX:2" sentFolder={false} inbox loading={false} error={null} hasMore onOpen={() => undefined} onMore={() => undefined} onRetry={() => undefined} />);
    expect(inbox).toContain(">Today</h3>");
    expect(inbox).toContain(">Earlier</h3>");
    expect(inbox).toContain("data-unread=\"true\"");
    expect(inbox).toContain("Waiting 3h for a reply");
    expect(inbox).toContain("3 messages");
    expect(inbox).toContain("Show older");
    const sent = renderToStaticMarkup(<MailList items={items} selected={null} sentFolder inbox={false} loading={false} error={null} hasMore={false} onOpen={() => undefined} onMore={() => undefined} onRetry={() => undefined} />);
    expect(sent).toContain("To sales@example.test");
    expect(sent).not.toContain("Waiting");
    vi.useRealTimers();
  });

  it("shows a conversation with Reply as the gold action and folder-appropriate moves", () => {
    const message: ThreadMessage = { uid: 2, mailbox: "INBOX", messageId: "<2@x>", inReplyTo: null, references: [], subject: "Eldoret screen", from: [{ name: "Brian", address: "brian@client.test" }], to: [{ name: "", address: "sales@example.test" }], cc: [{ name: "", address: "ops@client.test" }], date: "2026-11-17T12:00:00Z", html: "<p>Hello</p>", text: "Hello", attachments: [{ index: 0, filename: "brief.pdf", size: 2048, contentType: "application/pdf", inline: false }], seen: true, flagged: false };
    const props = { accountId: "a", messages: [message], loading: false, error: null, flagged: false, onAct: () => undefined, onReply: () => undefined, onBack: () => undefined, onRetry: () => undefined };
    const inbox = renderToStaticMarkup(<MailReader {...props} special="inbox" />);
    expect(inbox.match(/mg-primary/g)).toHaveLength(1);
    expect(inbox).toContain("Reply all");
    expect(inbox).toContain("aria-label=\"Archive\"");
    expect(inbox).toContain("/manage/mail/attachment?account=a&amp;mailbox=INBOX&amp;uid=2&amp;i=0");
    expect(inbox).toContain("sandbox=\"allow-same-origin allow-popups allow-popups-to-escape-sandbox\"");
    const bin = renderToStaticMarkup(<MailReader {...props} special="trash" />);
    expect(bin).toContain("Move to inbox");
    expect(bin).not.toContain("Move to bin");
  });
});
