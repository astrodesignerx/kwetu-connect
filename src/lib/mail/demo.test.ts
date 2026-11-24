import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAccountFields, demoAct, demoFolders, demoList, demoSend, demoThread, isDemoAccount, mailDemoEnabled } from "./demo";
import type { MailAccount } from "./client";

const account = (): MailAccount => ({ id: `t-${Math.random()}`, owner_email: "demo@kca.local", created_at: new Date().toISOString(), ...demoAccountFields("") });

afterEach(() => vi.unstubAllEnvs());

describe("demo mailbox", () => {
  it("only switches on for the dev server without Supabase", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(mailDemoEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(mailDemoEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "b");
    expect(mailDemoEnabled()).toBe(false);
  });

  it("opens with no address and lists the inbox newest first", () => {
    const a = account();
    expect(a.email).toBe("you@kwetuconnectads.co.ke");
    expect(isDemoAccount(a)).toBe(true);
    const { items, total } = demoList(a, "INBOX", {}, 0, 40);
    expect(total).toBe(items.length);
    expect(items.map((i) => i.date)).toEqual([...items.map((i) => i.date)].sort().reverse());
    expect(demoFolders(a).unread).toBe(items.filter((i) => !i.seen).length);
  });

  it("reads a conversation with the reply from Sent and marks it read", () => {
    const a = account();
    const row = demoList(a, "INBOX", { unread: true }, 0, 40).items.find((i) => i.subject.startsWith("Re: Booking"))!;
    const thread = demoThread(a, "INBOX", row.uid, "booking for the kisumu ndogo road screen in december");
    expect(thread.map((m) => m.mailbox)).toEqual(["INBOX", "Sent", "INBOX"]);
    expect(demoList(a, "INBOX", { unread: true }, 0, 40).items.some((i) => i.uid === row.uid)).toBe(false);
  });

  it("archives, stars and files sent mail", () => {
    const a = account();
    const first = demoList(a, "INBOX", {}, 0, 40).items[0];
    demoAct(a, "INBOX", [first.uid], "star");
    expect(demoList(a, "INBOX", { flagged: true }, 0, 40).items.some((i) => i.uid === first.uid)).toBe(true);
    demoAct(a, "INBOX", [first.uid], "archive");
    expect(demoList(a, "Archive", {}, 0, 40).items.some((i) => i.uid === first.uid)).toBe(true);
    demoSend(a, { to: ["x@example.com"], cc: [], subject: "Hello", html: "<p>Hi</p>", text: "Hi" }, null);
    expect(demoList(a, "Sent", { text: "hello" }, 0, 40).total).toBe(1);
  });
});
