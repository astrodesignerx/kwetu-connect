import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { classify, cleanHtml, explain, MailError, normaliseSubject, parseSource, pathOf } from "./client";
import { decryptSecret, encryptionConfigured, encryptSecret } from "./crypto";
import { detectMailbox, pickServer } from "./autoconfig";
import { listAccounts, loadAccount, removeAccount, saveAccount } from "./accounts";

const key = () => randomBytes(32).toString("base64");
const servers = { imap_host: "mail.example.test", imap_port: 993, imap_secure: true, smtp_host: "mail.example.test", smtp_port: 465, smtp_secure: true, username: "a@example.test" };

beforeEach(() => {
  vi.stubEnv("MAIL_ENCRYPTION_KEY", key());
  vi.stubEnv("MAIL_ENCRYPTION_KEY_PREVIOUS", "");
  // Memory mode for the account store: no Supabase in tests.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("mailbox password encryption", () => {
  it("round-trips, never stores the password itself and differs every time", () => {
    const a = encryptSecret("hunter2 webmail");
    const b = encryptSecret("hunter2 webmail");
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(a).not.toContain("hunter2");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("hunter2 webmail");
  });

  it("reads values made with the previous key while the key is rotated", () => {
    const old = encryptSecret("old password");
    vi.stubEnv("MAIL_ENCRYPTION_KEY_PREVIOUS", process.env.MAIL_ENCRYPTION_KEY!);
    vi.stubEnv("MAIL_ENCRYPTION_KEY", key());
    expect(decryptSecret(old)).toBe("old password");
  });

  it("refuses to work without a key, with a wrong key and with plaintext", () => {
    const saved = encryptSecret("secret");
    vi.stubEnv("MAIL_ENCRYPTION_KEY", key());
    expect(() => decryptSecret(saved)).toThrow(/Reconnect/);
    expect(() => decryptSecret("secret")).toThrow(/Reconnect/);
    vi.stubEnv("MAIL_ENCRYPTION_KEY", "");
    expect(encryptionConfigured()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(/MAIL_ENCRYPTION_KEY/);
    vi.stubEnv("MAIL_ENCRYPTION_KEY", "short");
    expect(() => encryptSecret("secret")).toThrow(/32 bytes/);
  });
});

describe("mail client helpers", () => {
  it("names folders by their job from flags or names, and skips folders that cannot hold mail", () => {
    const boxes = classify([
      { path: "INBOX", name: "INBOX", flags: new Set(), specialUse: "" },
      { path: "INBOX.Sent", name: "Sent", flags: new Set(), specialUse: "\\Sent" },
      { path: "INBOX.Junk", name: "Junk", flags: new Set(), specialUse: "" },
      { path: "INBOX.Deleted Messages", name: "Deleted Messages", flags: new Set(), specialUse: "" },
      { path: "INBOX.Archive", name: "Archive", flags: new Set(), specialUse: "" },
      { path: "[Gmail]", name: "[Gmail]", flags: new Set(["\\Noselect"]), specialUse: "" },
    ] as never);
    expect(boxes.map((b) => b.special)).toEqual(["inbox", "sent", "spam", "trash", "archive"]);
    expect(pathOf(boxes, "trash")).toBe("INBOX.Deleted Messages");
  });

  it("strips scripts, handlers and forms from email HTML and upgrades http pictures", () => {
    const html = cleanHtml(`<p onclick="steal()">Hi</p><script>alert(1)</script><img src="http://x.test/a.png" onerror="x()"><form action="/x"><input></form><a href="javascript:alert(1)">bad</a><a href="https://ok.test">ok</a>`);
    expect(html).not.toMatch(/script|onclick|onerror|<form|<input|javascript:/i);
    expect(html).toContain(`src="https://x.test/a.png"`);
    expect(html).toContain(`target="_blank"`);
    expect(html).toContain(`rel="noopener noreferrer nofollow"`);
  });

  it("explains failures in plain words and never repeats server text", () => {
    expect(explain(Object.assign(new Error("Command failed"), { authenticationFailed: true }))).toMatch(/did not accept the sign-in/);
    expect(explain(new Error("getaddrinfo ENOTFOUND mail.nowhere.test"))).toMatch(/could not be found/);
    expect(explain(new Error("Socket timeout"))).toMatch(/too long/);
    expect(explain(new Error("internal detail 10.0.0.5"))).not.toContain("10.0.0.5");
    expect(explain(new MailError("Exact words"))).toBe("Exact words");
  });

  it("matches reply and forward subjects to the original", () => {
    expect(normaliseSubject("Re: RE: Fwd: Eldoret screen")).toBe("eldoret screen");
  });

  it("parses a message with an attachment and an embedded picture", async () => {
    const raw = Buffer.from([
      "From: Amina <amina@example.test>", "To: sales@example.test", "Subject: Quote", "Message-ID: <q1@example.test>",
      "Date: Tue, 17 Nov 2026 09:00:00 +0300", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="b"', "",
      "--b", "Content-Type: text/html; charset=utf-8", "", '<p>Hello</p><img src="cid:logo"><script>x()</script>',
      "--b", "Content-Type: image/png", "Content-ID: <logo>", "Content-Disposition: inline", "Content-Transfer-Encoding: base64", "", "iVBORw0KGgo=",
      "--b", "Content-Type: application/pdf; name=quote.pdf", "Content-Disposition: attachment; filename=quote.pdf", "Content-Transfer-Encoding: base64", "", "JVBERi0=",
      "--b--", "",
    ].join("\r\n"));
    const m = await parseSource(7, raw);
    expect(m.subject).toBe("Quote");
    expect(m.from).toEqual([{ name: "Amina", address: "amina@example.test" }]);
    expect(m.html).toContain("data:image/png;base64,");
    expect(m.html).not.toContain("<script");
    expect(m.attachments.find((a) => a.filename === "quote.pdf")?.inline).toBe(false);
  });
});

describe("finding mail servers", () => {
  it("knows Kwetu Connect mail without asking the network", async () => {
    const found = await detectMailbox("sales@kwetuconnectads.co.ke");
    expect(found.imap).toEqual(["mail.kwetuconnectads.co.ke", 993, true]);
    expect(found.smtp).toEqual(["mail.kwetuconnectads.co.ke", 465, true]);
  });

  it("reads servers from an autoconfig file and rejects odd host names", () => {
    const xml = `<incomingServer type="imap"><hostname>mail.%EMAILDOMAIN%</hostname><port>993</port><socketType>SSL</socketType></incomingServer>
      <outgoingServer type="smtp"><hostname>bad host!</hostname><port>465</port></outgoingServer>`;
    expect(pickServer(xml, "incomingServer", "imap", "example.test", "a")).toEqual(["mail.example.test", 993, true]);
    expect(pickServer(xml, "outgoingServer", "smtp", "example.test", "a")).toBeNull();
  });

  it("rejects an address with no domain", async () => {
    await expect(detectMailbox("nobody")).rejects.toThrow(/valid email/);
  });
});

describe("personal mailboxes", () => {
  it("keeps each person's mailboxes to themselves", async () => {
    const a = await saveAccount("Amina@Example.test", { ...servers, email: "sales@example.test", label: "sales@example.test", password_enc: encryptSecret("p") });
    await saveAccount("brian@example.test", { ...servers, email: "brian@example.test", label: "brian@example.test", password_enc: encryptSecret("p") });
    expect((await listAccounts("amina@example.test")).map((x) => x.email)).toEqual(["sales@example.test"]);
    await expect(loadAccount("brian@example.test", a.id)).rejects.toThrow(/not connected/);
    await expect(removeAccount("brian@example.test", a.id)).rejects.toThrow("not connected");
    expect(await loadAccount("amina@example.test", a.id)).toMatchObject({ email: "sales@example.test" });
    const again = await saveAccount("amina@example.test", { ...servers, email: "sales@example.test", label: "sales@example.test", password_enc: encryptSecret("new") });
    expect(again.id).toBe(a.id);
    await removeAccount("amina@example.test", a.id);
    expect(await listAccounts("amina@example.test")).toEqual([]);
  });
});
