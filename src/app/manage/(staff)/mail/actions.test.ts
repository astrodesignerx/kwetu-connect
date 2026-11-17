import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const mocks = vi.hoisted(() => ({
  staff: { email: "amina@example.test" },
  testImap: vi.fn(), verifySmtp: vi.fn(), sendMail: vi.fn(), detect: vi.fn(),
  imap: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/auth/server", () => ({ requireStaff: async () => mocks.staff }));
vi.mock("@/lib/mail/autoconfig", () => ({ detectMailbox: mocks.detect }));
vi.mock("@/lib/mail/client", async (original) => {
  const real = await original<typeof import("@/lib/mail/client")>();
  return {
    ...real,
    testImap: mocks.testImap,
    verifySmtp: mocks.verifySmtp,
    transporter: () => ({ sendMail: mocks.sendMail }),
    withImap: async (_account: unknown, fn: (c: unknown) => unknown) => fn(mocks.imap),
  };
});

import { connectMailbox, disconnectMailbox, mailAct, mailList, mailSend, mailThread, myMailboxes } from "./actions";
import { saveAccount } from "@/lib/mail/accounts";
import { encryptSecret } from "@/lib/mail/crypto";

const servers = { imap_host: "mail.example.test", imap_port: 993, imap_secure: true, smtp_host: "mail.example.test", smtp_port: 465, smtp_secure: true, username: "sales@example.test" };
const boxes = [
  { path: "INBOX", name: "INBOX", flags: new Set(), specialUse: "" },
  { path: "INBOX.Sent", name: "Sent", flags: new Set(), specialUse: "\\Sent" },
  { path: "INBOX.Archive", name: "Archive", flags: new Set(), specialUse: "\\Archive" },
  { path: "INBOX.Trash", name: "Trash", flags: new Set(), specialUse: "\\Trash" },
];
function fakeImap(messages: { uid: number; subject: string; seen?: boolean }[] = []) {
  const calls: unknown[][] = [];
  const imap = {
    calls,
    mailbox: { exists: messages.length },
    list: async () => boxes,
    status: async () => ({ unseen: 1 }),
    getMailboxLock: async (path: string) => { calls.push(["lock", path]); return { release: () => undefined }; },
    search: async (q: unknown) => { calls.push(["search", q]); return messages.map((m) => m.uid); },
    fetch: async function* () {
      for (const m of messages) yield {
        uid: m.uid, flags: new Set(m.seen ? ["\\Seen"] : []), internalDate: new Date("2026-11-17T06:00:00Z"),
        envelope: { subject: m.subject, from: [{ name: "Brian", address: "brian@client.test" }], to: [{ name: "", address: "sales@example.test" }], date: new Date("2026-11-17T06:00:00Z"), messageId: `<${m.uid}@client.test>` },
        bodyStructure: {}, source: Buffer.from(`From: Brian <brian@client.test>\r\nSubject: ${m.subject}\r\nMessage-ID: <${m.uid}@client.test>\r\n\r\nHello ${m.uid}`),
      };
    },
    messageFlagsAdd: async (...a: unknown[]) => { calls.push(["flag", ...a]); },
    messageFlagsRemove: async (...a: unknown[]) => { calls.push(["unflag", ...a]); },
    messageMove: async (...a: unknown[]) => { calls.push(["move", ...a]); },
    append: async (...a: unknown[]) => { calls.push(["append", a[0]]); },
  };
  mocks.imap = imap;
  return imap;
}
async function connected(owner = "amina@example.test") {
  return saveAccount(owner, { ...servers, email: "sales@example.test", label: "sales@example.test", password_enc: encryptSecret("pw") });
}

beforeEach(() => {
  vi.stubEnv("MAIL_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  mocks.staff = { email: "amina@example.test" };
  mocks.detect.mockResolvedValue({ label: "x", imap: ["mail.example.test", 993, true], smtp: ["mail.example.test", 465, true] });
  mocks.testImap.mockResolvedValue(undefined);
  mocks.verifySmtp.mockResolvedValue(undefined);
  mocks.sendMail.mockResolvedValue({});
});
afterEach(async () => {
  for (const owner of ["amina@example.test", "brian@example.test"]) {
    mocks.staff = { email: owner };
    const mine = await myMailboxes();
    if (mine.ok) for (const a of mine.data) await disconnectMailbox(a.id);
  }
  vi.clearAllMocks(); vi.unstubAllEnvs();
});

describe("connecting a mailbox", () => {
  it("checks reading and sending before saving, and stores the password encrypted", async () => {
    const result = await connectMailbox({ email: " Sales@Example.test ", password: "webmail-pass" });
    expect(result).toMatchObject({ ok: true, data: { email: "sales@example.test" } });
    expect(mocks.testImap).toHaveBeenCalledWith(expect.objectContaining({ imap_host: "mail.example.test", username: "sales@example.test" }), "webmail-pass");
    expect(mocks.verifySmtp).toHaveBeenCalled();
    expect(await myMailboxes()).toMatchObject({ ok: true, data: [{ email: "sales@example.test" }] });
  });

  it("saves nothing when the sign-in or sending fails, and says why in plain words", async () => {
    mocks.testImap.mockRejectedValueOnce(Object.assign(new Error("NO [AUTHENTICATIONFAILED]"), { authenticationFailed: true }));
    expect(await connectMailbox({ email: "sales@example.test", password: "wrong" })).toEqual({ ok: false, error: "The mailbox did not accept the sign-in. Check the address and password." });
    mocks.verifySmtp.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    expect(await connectMailbox({ email: "sales@example.test", password: "pw" })).toMatchObject({ ok: false, error: expect.stringMatching(/^Reading mail works, but sending does not/) });
    expect(await myMailboxes()).toEqual({ ok: true, data: [] });
  });

  it("refuses bad input and unknown servers", async () => {
    expect(await connectMailbox({ email: "not-an-address", password: "x" })).toMatchObject({ ok: false, error: "Enter a valid email address." });
    expect(await connectMailbox({ email: "a@example.test", password: "" })).toMatchObject({ ok: false, error: "Enter the mailbox password." });
    expect(await connectMailbox({ email: "a@example.test", password: "x", imapHost: "bad host;", smtpHost: "mail.example.test" })).toMatchObject({ ok: false });
    mocks.detect.mockResolvedValueOnce({ label: "example.test" });
    expect(await connectMailbox({ email: "a@example.test", password: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/Server settings/) });
    expect(mocks.testImap).not.toHaveBeenCalled();
  });
});

describe("reading and acting on mail", () => {
  it("never opens another person's mailbox", async () => {
    const mine = await connected("amina@example.test");
    fakeImap([{ uid: 1, subject: "Hello" }]);
    mocks.staff = { email: "brian@example.test" };
    expect(await mailList(mine.id, "INBOX")).toEqual({ ok: false, error: "That mailbox is not connected." });
    expect(await mailAct(mine.id, "INBOX", [1], "archive")).toEqual({ ok: false, error: "That mailbox is not connected." });
    expect(await mailSend({ accountId: mine.id, to: ["x@client.test"], subject: "s", html: "<p>h</p>" })).toEqual({ ok: false, error: "That mailbox is not connected." });
  });

  it("lists a folder newest first and counts messages that share a subject", async () => {
    const account = await connected();
    fakeImap([{ uid: 3, subject: "Quote" }, { uid: 5, subject: "Re: Quote", seen: true }, { uid: 4, subject: "Other" }]);
    const result = await mailList(account.id, "INBOX");
    if (!result.ok) throw new Error(result.error);
    expect(result.data.items.map((m) => [m.uid, m.thread, m.seen])).toEqual([[5, 2, true], [4, 1, false], [3, 2, false]]);
    expect(result.data.total).toBe(3);
  });

  it("opens a conversation with the replies in Sent and marks the opened message read", async () => {
    const account = await connected();
    const imap = fakeImap([{ uid: 9, subject: "Quote" }]);
    const result = await mailThread(account.id, "INBOX", 9, "Quote");
    if (!result.ok) throw new Error(result.error);
    expect(result.data.map((m) => m.mailbox)).toEqual(["INBOX", "INBOX.Sent"]);
    expect(imap.calls).toContainEqual(["flag", "9", ["\\Seen"], { uid: true }]);
  });

  it("moves to the folder with that job, and refuses actions and folders it does not know", async () => {
    const account = await connected();
    const imap = fakeImap();
    expect(await mailAct(account.id, "INBOX", [2, 3], "archive")).toEqual({ ok: true, data: true });
    expect(imap.calls).toContainEqual(["move", "2,3", "INBOX.Archive", { uid: true }]);
    expect(await mailAct(account.id, "INBOX", [2], "delete" as never)).toMatchObject({ ok: false });
    expect(await mailAct(account.id, "INBOX\r\nA1 LOGOUT", [2], "read")).toMatchObject({ ok: false, error: "Choose a folder." });
    expect(await mailAct(account.id, "INBOX", [0], "read")).toMatchObject({ ok: false });
  });
});

describe("sending", () => {
  it("sends, files a copy in Sent and marks the original answered", async () => {
    const account = await connected();
    const imap = fakeImap();
    const result = await mailSend({ accountId: account.id, to: ["brian@client.test"], subject: "Re: Quote", html: "<p>Thanks</p>", inReplyTo: "<9@client.test>", references: ["<9@client.test>"], answers: { mailbox: "INBOX", uid: 9 } });
    expect(result).toEqual({ ok: true, data: true });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ envelope: { from: "sales@example.test", to: ["brian@client.test"] } }));
    expect(String(mocks.sendMail.mock.calls[0][0].raw)).toMatch(/In-Reply-To: <9@client.test>/);
    expect(imap.calls).toContainEqual(["append", "INBOX.Sent"]);
    expect(imap.calls).toContainEqual(["flag", "9", ["\\Answered"], { uid: true }]);
  });

  it("refuses no recipient, bad addresses and attachments over 4 MB", async () => {
    const account = await connected();
    fakeImap();
    expect(await mailSend({ accountId: account.id, to: [], subject: "s", html: "" })).toMatchObject({ ok: false, error: "Add at least one recipient." });
    expect(await mailSend({ accountId: account.id, to: ["brian@client.test"], cc: ["nope"], subject: "s", html: "" })).toMatchObject({ ok: false, error: '"nope" is not a valid email address.' });
    const big = Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64");
    expect(await mailSend({ accountId: account.id, to: ["brian@client.test"], subject: "s", html: "", attachments: [{ filename: "big.bin", contentType: "application/octet-stream", contentBase64: big }] })).toMatchObject({ ok: false, error: "Attachments can be up to 4 MB in total." });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
