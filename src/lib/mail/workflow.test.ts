import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoData } from "@/lib/store/demo";
import { DEFAULT_SETTINGS } from "@/lib/booking/settings";
import type { MessageRow } from "@/app/mail/actions";
import { clientsFrom, conversationKey, matchIndex, metaFor, partyOf, sameConversation } from "./kca";
import { filterConversations } from "./conversations";
import { saveAccount } from "./accounts";
import { demoAccountFields } from "./demo";
import { linkClient, listLinks, listMeta, readSignature, remindThread, saveSignature, snoozeThread, type ThreadMeta } from "./kca-data";
import { signatureHtml, snoozeChoices, textToHtml } from "@/components/mail/mail-format";

beforeEach(() => { for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) vi.stubEnv(key, ""); });
afterEach(() => vi.unstubAllEnvs());

const me = "team@example.com";
const row = (subject: string, date: string, extra: Partial<MessageRow> = {}): MessageRow => ({ uid: 1, mailbox: "INBOX", from: { name: "Client", address: "client@example.com" }, to: [{ name: "", address: me }], subject, date, seen: true, flagged: false, answered: false, hasAttachments: false, messageId: null, thread: 1, ...extra });
const meta = (thread_key: string, extra: Partial<ThreadMeta>): ThreadMeta => ({ mailbox_id: "a", thread_key, assigned_email: null, updated_at: "2026-11-20T00:00:00.000Z", ...extra });

describe("conversations by subject and other party", () => {
  it("keeps two clients who use the same subject apart", () => {
    const amina = row("Invoice", "2026-11-20", { from: { name: "", address: "amina@example.com" } });
    const brian = row("Re: invoice", "2026-11-21", { from: { name: "", address: "BRIAN@example.com" } });
    const reply = row("Re: Invoice", "2026-11-22", { mailbox: "Sent", from: { name: "", address: me }, to: [{ name: "", address: "amina@example.com" }] });
    expect(partyOf(brian, me)).toBe("brian@example.com");
    expect(partyOf(reply, me)).toBe("amina@example.com");
    expect(conversationKey(amina.subject, partyOf(amina, me))).toBe(conversationKey(reply.subject, partyOf(reply, me)));
    expect(conversationKey(amina.subject, partyOf(amina, me))).not.toBe(conversationKey(brian.subject, partyOf(brian, me)));
  });

  it("reads a thread with the same party or a reply link, never another client's message", () => {
    const m = (from: string, to: string, extra = {}) => ({ from: [{ address: from }], to: [{ address: to }], cc: [], messageId: null as string | null, inReplyTo: null as string | null, references: [] as string[], ...extra });
    const opened = m("amina@example.com", me, { messageId: "<2@x>", references: ["<1@x>"] });
    const ours = m(me, "amina@example.com"), other = m("brian@example.com", me), forwarded = m(me, "studio@partner.example", { messageId: "<1@x>" });
    expect(sameConversation(opened, [opened, ours, other, forwarded], me)).toEqual([opened, ours, forwarded]);
  });

  it("still finds workspace rows saved before conversations had a party", () => {
    const rows = [meta("invoice", { assigned_email: "old@example.com" })];
    expect(metaFor(rows, "Re: Invoice", "amina@example.com")?.assigned_email).toBe("old@example.com");
    rows.push(meta("invoice | amina@example.com", { assigned_email: "new@example.com" }));
    expect(metaFor(rows, "Invoice", "amina@example.com")?.assigned_email).toBe("new@example.com");
  });
});

describe("snooze and follow-ups", () => {
  const now = Date.parse("2026-11-26T09:00:00.000Z");
  it("leaves snoozed conversations out of waiting until the snooze ends", () => {
    const rows = [row("Question", "2026-11-25T08:00:00.000Z")];
    const key = conversationKey("Question", "client@example.com");
    expect(filterConversations(rows, { kind: "waiting" }, me, ["INBOX"], [meta(key, { snoozed_until: "2026-11-27T05:00:00.000Z" })], now)).toHaveLength(0);
    expect(filterConversations(rows, { kind: "waiting" }, me, ["INBOX"], [meta(key, { snoozed_until: "2026-11-26T05:00:00.000Z" })], now)).toHaveLength(1);
  });
  it("lists a due reminder only while the other party has not written since", () => {
    const sent = row("Quote", "2026-11-22T08:00:00.000Z", { mailbox: "Sent", from: { name: "", address: me }, to: [{ name: "", address: "client@example.com" }] });
    const key = conversationKey("Quote", "client@example.com");
    const due = meta(key, { remind_at: "2026-11-25T08:00:00.000Z", remind_since: "2026-11-22T08:00:00.000Z" });
    expect(filterConversations([sent], { kind: "followup" }, me, ["INBOX"], [due], now)).toHaveLength(1);
    const answer = row("Re: Quote", "2026-11-23T08:00:00.000Z");
    expect(filterConversations([answer, sent], { kind: "followup" }, me, ["INBOX"], [due], now)).toHaveLength(0);
    expect(filterConversations([sent], { kind: "followup" }, me, ["INBOX"], [{ ...due, remind_at: "2026-11-27T08:00:00.000Z" }], now)).toHaveLength(0);
  });
  it("offers Nairobi times and saves snoozes and reminders per conversation", async () => {
    const choices = snoozeChoices(new Date("2026-11-26T08:00:00.000Z")).map((c) => [c.label, c.at.toISOString()]);
    expect(choices).toContainEqual(["Tomorrow morning", "2026-11-27T05:00:00.000Z"]);
    expect(choices).toContainEqual(["Next week", "2026-11-30T05:00:00.000Z"]);
    const account = await saveAccount("owner@example.com", demoAccountFields("desk@example.com"));
    await snoozeThread("owner@example.com", account.id, "Re: Quote", "client@example.com", new Date(Date.now() + 3_600_000).toISOString());
    await remindThread("owner@example.com", account.id, "Quote", "client@example.com", new Date(Date.now() + 86_400_000).toISOString());
    const saved = metaFor(await listMeta("owner@example.com", account.id), "Quote", "client@example.com");
    expect(saved?.snoozed_until).toBeTruthy();
    expect(saved?.remind_at).toBeTruthy();
    await expect(snoozeThread("owner@example.com", account.id, "Quote", "client@example.com", "2020-01-01T00:00:00.000Z")).rejects.toThrow("within the next year");
    await expect(snoozeThread("intruder@example.com", account.id, "Quote", "client@example.com", null)).rejects.toThrow("not connected");
  });
});

describe("client links and signatures", () => {
  it("lets a linked sender match a booking client without moving the booking email", async () => {
    const data = { ...demoData("2026-11-24"), settings: DEFAULT_SETTINGS };
    const client = clientsFrom(data)[0];
    await linkClient("staff@example.com", "Accounts@Client.example", client.id);
    const links = await listLinks();
    const linked = clientsFrom(data, links).find((c) => c.id === client.id)!;
    expect(linked.emails[0]).toBe(client.emails[0]);
    expect(linked.linked).toContain("accounts@client.example");
    expect(matchIndex(data, links)({ subject: "Hello", addresses: ["accounts@client.example"] }).client?.id).toBe(client.id);
    await linkClient("staff@example.com", "accounts@client.example", null);
    expect(matchIndex(data, await listLinks())({ subject: "Hello", addresses: ["accounts@client.example"] }).client).toBeNull();
  });
  it("keeps one owner-edited signature per mailbox", async () => {
    const account = await saveAccount("owner@example.com", demoAccountFields("sign@example.com"));
    await saveSignature("owner@example.com", account.id, "Rose\r\n**KCA**");
    expect(await readSignature("owner@example.com", account.id)).toBe("Rose\n**KCA**");
    await expect(saveSignature("owner@example.com", account.id, "x".repeat(2001))).rejects.toThrow("2,000");
    expect(signatureHtml("Rose\n**KCA**")).toBe('<div class="kca-signature" style="margin-top:18px"><p>Rose<br><strong>KCA</strong></p></div>');
  });
});

describe("compose formatting", () => {
  it("turns typed formatting into email HTML and leaves everything else as text", () => {
    expect(textToHtml("Please **confirm** by *Friday*.\nSee [rates](https://example.com/a_b) or https://example.com/x_y.")).toBe('<p>Please <strong>confirm</strong> by <em>Friday</em>.<br>See <a href="https://example.com/a_b">rates</a> or <a href="https://example.com/x_y">https://example.com/x_y</a>.</p>');
    expect(textToHtml("Options:\n- 10 s\n- 15 s\n1. Pay\n2. Send")).toBe("<p>Options:</p><ul><li>10 s</li><li>15 s</li></ul><ol><li>Pay</li><li>Send</li></ol>");
    expect(textToHtml("5 * 3 and snake_case [x](javascript:alert(1)) <b>")).toBe("<p>5 * 3 and snake_case [x](javascript:alert(1)) &lt;b&gt;</p>");
  });
});
