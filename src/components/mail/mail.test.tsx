import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MessageRow, ThreadMessage } from "@/app/mail/actions";

vi.mock("@/app/mail/actions", () => ({
  connectMailbox: vi.fn(), disconnectMailbox: vi.fn(), mailAct: vi.fn(), mailFolders: vi.fn(), mailList: vi.fn(), mailThread: vi.fn(), mailSend: vi.fn(), myMailboxes: vi.fn(),
}));
vi.mock("@/app/mail/kca-actions", () => ({
  mailWorkspace: vi.fn(), mailAssigned: vi.fn(), mailWaiting: vi.fn(), mailClientConversations: vi.fn(), mailAssign: vi.fn(), mailSaveNote: vi.fn(), mailSaveTemplate: vi.fn(), mailDeleteTemplate: vi.fn(),
}));
vi.mock("@/app/manage/auth-actions", () => ({ signOut: vi.fn() }));

import ConnectMailbox from "./ConnectMailbox";
import MailDesk from "./MailDesk";
import MailIcon from "./MailIcon";
import MailList from "./MailList";
import MailReader from "./MailReader";
import MailTheme, { MailAppearance } from "./MailTheme";
import { dayGroup, initials, listTime, quoteBlock, replyRecipients, replySubject, splitAddresses, textToHtml, waitingFor } from "./mail-format";

const NOW = new Date("2026-11-17T15:00:00Z"); // 18:00 in Nairobi
const row = (over: Partial<MessageRow>): MessageRow => ({
  uid: 1, mailbox: "INBOX", from: { name: "Brian Otieno", address: "brian@client.test" }, to: [{ name: "", address: "sales@example.test" }],
  subject: "Eldoret screen", date: "2026-11-17T12:00:00Z", seen: true, flagged: false, answered: false, hasAttachments: false, messageId: "<1@x>", thread: 1, ...over,
});

describe("mail formatting", () => {
  it("honours Reply-To and deduplicates reply-all recipients across To and Cc", () => {
    const addr = (address:string)=>({name:"",address});
    const message = {from:[addr("robot@client.test")], replyTo:[addr("desk@client.test")], to:[addr("SALES@example.test")], cc:[addr("DESK@client.test"),addr("Ada@client.test"),addr("ada@client.test")]};
    expect(replyRecipients("replyAll", message, "sales@example.test")).toEqual({to:"desk@client.test", cc:"Ada@client.test"});
    expect(replyRecipients("reply", message, "sales@example.test")).toEqual({to:"desk@client.test", cc:""});
    expect(replyRecipients("replyAll", {...message, from:message.to, to:message.replyTo}, "sales@example.test")).toEqual({to:"desk@client.test", cc:"Ada@client.test"});
    expect(replyRecipients("forward", message, "sales@example.test")).toEqual({to:"",cc:""});
  });
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
    const html = renderToStaticMarkup(<MailDesk initialAccounts={[]} initialQuery="" me="staff@example.test" />);
    expect(html).toContain("Connect your mailbox");
    expect(html).toContain("Use the address and password you sign in to webmail with.");
    expect(html).toContain("Connect an address once, then share it with the colleagues who answer it. The password is stored encrypted.");
    expect(html).toContain('aria-label="Staff account and appearance"');
    expect(html).toContain('class="staff-account-email">staff@example.test</p>');
    expect(html).toContain(">Sign out</button>");
    expect(html.match(/mg-primary/g)).toHaveLength(1);
  });

  it("opens on the inbox of the first mailbox with New email as the one gold action", () => {
    const html = renderToStaticMarkup(<MailDesk initialAccounts={[{ id: "a", label: "sales@example.test", email: "sales@example.test" }]} initialQuery="quote" />);
    expect(html).toContain("<h1 class=\"sr\">Mail</h1>");
    expect(html).toContain("sales@example.test");
    expect(html).toContain("Results for &ldquo;quote&rdquo;".replace("&ldquo;", "“").replace("&rdquo;", "”"));
    expect(html).toContain("aria-current=\"page\"");
    expect(html.match(/mg-primary/g)).toHaveLength(1);
  });

  it("lists mail under day headings, bold when unread, with ember waiting times in the inbox only", () => {
    vi.useFakeTimers({ now: NOW });
    const items = [row({ uid: 2, seen: false, hasAttachments: true, thread: 3 }), row({ uid: 1, subject: "Earlier screen enquiry", date: "2026-11-10T08:00:00Z", answered: true })];
    const inbox = renderToStaticMarkup(<MailList items={items} selected="INBOX:2" sentFolder={false} inbox loading={false} error={null} hasMore onOpen={() => undefined} onMore={() => undefined} onRetry={() => undefined} />);
    expect(inbox).toContain(">Today</span>");
    expect(inbox).toContain(">Earlier</span>");
    expect(inbox).toContain("data-unread=\"true\"");
    expect(inbox).toContain("Waiting 3h for a reply");
    expect(inbox).toContain("3 messages");
    expect(inbox).toContain("Show older");
    const sent = renderToStaticMarkup(<MailList items={items} selected={null} sentFolder inbox={false} loading={false} error={null} hasMore={false} onOpen={() => undefined} onMore={() => undefined} onRetry={() => undefined} />);
    expect(sent).toContain("To sales@example.test");
    expect(sent).not.toContain("Waiting");
    vi.useRealTimers();
  });

  it("renders the stored Graphite theme before hydration", () => {
    const html = renderToStaticMarkup(
      <MailAppearance className="mail-app" initialGraphite>
        <MailTheme />
      </MailAppearance>,
    );
    expect(html).toContain('data-mail-theme="graphite"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Graphite/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?System/);
  });

  it("drops a recipient-only preview and keeps one message count in a grouped inbox", () => {
    const html = renderToStaticMarkup(<MailList items={[row({ thread: 3, snippet: " Sales@example.test " })]}
      selected="INBOX:1" sentFolder={false} inbox waitingKeys={new Set()} loading={false} error={null} hasMore={false}
      onOpen={() => undefined} onMore={() => undefined} onRetry={() => undefined} />);
    expect(html).toContain("Other mail");
    expect(html).not.toContain("row-snip");
    expect(html.match(/3 messages/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true">3</span>');
  });

  it("shows a conversation with Reply as the gold action and folder-appropriate moves", () => {
    const message: ThreadMessage = { uid: 2, mailbox: "INBOX", messageId: "<2@x>", inReplyTo: null, references: [], subject: "Eldoret screen", from: [{ name: "Brian", address: "brian@client.test" }], to: [{ name: "", address: "sales@example.test" }], cc: [{ name: "", address: "ops@client.test" }], date: "2026-11-17T12:00:00Z", html: "<p>Hello</p>", text: "Hello", attachments: [{ index: 0, filename: "brief.pdf", size: 2048, contentType: "application/pdf", inline: false }], seen: true, flagged: false };
    const props = { accountId: "a", messages: [message], loading: false, error: null, flagged: false, onAct: () => undefined, onReply: () => undefined, onBack: () => undefined, onRetry: () => undefined };
    const inbox = renderToStaticMarkup(<MailReader {...props} special="inbox" />);
    expect(inbox.match(/mg-primary/g)).toHaveLength(1);
    expect(inbox).toContain("Reply all");
    expect(inbox).toContain("aria-label=\"Archive\"");
    expect(inbox).toContain("/mail/attachment?account=a&amp;mailbox=INBOX&amp;uid=2&amp;i=0");
    expect(inbox).toContain("sandbox=\"allow-same-origin allow-popups allow-popups-to-escape-sandbox\"");
    const bin = renderToStaticMarkup(<MailReader {...props} special="trash" />);
    expect(bin).toContain("Move to inbox");
    expect(bin).not.toContain("Move to bin");
  });

  it("renders Lucide icons at aligned sizes with stroke width 1.75 and explicit filled state", () => {
    const def = renderToStaticMarkup(<MailIcon name="inbox" />);
    expect(def).toContain("lucide-inbox");
    expect(def).toContain('width="18"');
    expect(def).toContain('height="18"');
    expect(def).toContain('stroke-width="1.75"');
    expect(def).toContain('aria-hidden="true"');
    expect(def).not.toContain("ic-fill");

    const sm = renderToStaticMarkup(<MailIcon name="star" size="sm" />);
    expect(sm).toContain('width="16"');
    expect(sm).toContain('class="lucide lucide-star ic sm"');
    expect(sm).not.toContain("ic-fill");

    const xsFilled = renderToStaticMarkup(<MailIcon name="star" size="xs" filled />);
    expect(xsFilled).toContain('width="14"');
    expect(xsFilled).toContain('class="lucide lucide-star ic xs ic-fill"');
  });

  it("uses Lucide icons in MailDesk and ConnectMailbox with semantic Sign out and Shortcuts icons", () => {
    const desk = renderToStaticMarkup(<MailDesk initialAccounts={[]} initialQuery="" me="staff@example.test" />);
    expect(desk).toContain("lucide-log-out");
    expect(desk).not.toContain("lucide-chevron-left");
    expect(desk).toContain("lucide-keyboard");
    expect(desk).toContain("lucide-settings");
    expect(desk).not.toContain('viewBox="0 0 20 20"');
    expect(desk).not.toContain('viewBox="0 0 256 256"');

    const connect = renderToStaticMarkup(<ConnectMailbox first onConnected={() => undefined} />);
    expect(connect).toContain("lucide-eye");
    expect(connect).toContain("lucide-lock");
    expect(connect).not.toContain('viewBox="0 0 256 256"');
  });

  it("renders distinct Lucide attachment icons and filled starred states in MailReader", () => {
    const message: ThreadMessage = {
      uid: 2,
      mailbox: "INBOX",
      messageId: "<2@x>",
      inReplyTo: null,
      references: [],
      subject: "Campaign files",
      from: [{ name: "Brian", address: "brian@client.test" }],
      to: [{ name: "", address: "sales@example.test" }],
      cc: [],
      date: "2026-11-17T12:00:00Z",
      html: "<p>Hello</p>",
      text: "Hello",
      attachments: [
        { index: 0, filename: "brief.pdf", size: 2048, contentType: "application/pdf", inline: false },
        { index: 1, filename: "still.png", size: 4096, contentType: "image/png", inline: false },
        { index: 2, filename: "spot.mp4", size: 8192, contentType: "video/mp4", inline: false },
      ],
      seen: true,
      flagged: true,
    };
    const html = renderToStaticMarkup(
      <MailReader
        accountId="a"
        special="inbox"
        messages={[message]}
        loading={false}
        error={null}
        flagged
        onAct={() => undefined}
        onReply={() => undefined}
        onBack={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain("lucide-file-text");
    expect(html).toContain("lucide-image");
    expect(html).toContain("lucide-play");
    expect(html).toContain("tb-star star-on");
    expect(html).toContain("lucide-star ic ic-fill");
    expect(html).toContain("lucide-star ic sm ic-fill");
  });

  it("renders filled gold stars for flagged rows and quick-action unstar buttons in MailList", () => {
    const html = renderToStaticMarkup(
      <MailList
        items={[row({ uid: 7, flagged: true })]}
        selected={null}
        sentFolder={false}
        inbox={false}
        loading={false}
        error={null}
        hasMore={false}
        onOpen={() => undefined}
        onMore={() => undefined}
        onRetry={() => undefined}
        onAct={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Starred"><svg');
    expect(html).toContain("lucide-star ic xs ic-fill");
    expect(html).toContain('class="star-on" aria-label="Remove star: Eldoret screen"');
    expect(html).toContain("lucide-star ic sm ic-fill");
  });
});
