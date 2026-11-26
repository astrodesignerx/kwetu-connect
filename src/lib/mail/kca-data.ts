import { randomUUID } from "node:crypto";
import { mailDb, mailMemoryMode } from "./db";
import { MailError } from "./client";
import { loadAccount, mailboxPeople } from "./accounts";
import { conversationKey, emailKey, type ClientLink } from "./kca";

export type Template = { id: string; name: string; body: string; sort_order: number; created_by: string | null };
export type ThreadMeta = {
  mailbox_id: string; thread_key: string; assigned_email: string | null; updated_at: string;
  done_message_id?: string | null; done_at?: string | null; done_by?: string | null;
  /** Hidden from the inbox until then (migration 0009). */
  snoozed_until?: string | null; snoozed_by?: string | null;
  /** Listed under "No reply yet" from remind_at unless the other party writes after remind_since (migration 0009). */
  remind_at?: string | null; remind_since?: string | null; remind_by?: string | null;
};
export type ClientNote = { advertiser_email: string; note: string; updated_by: string | null; updated_at: string };
export const STARTER_REPLIES = [
  ["Advert approved", "Your advert has passed our review. You can check the booking status and planned dates on your booking page."],
  ["Payment received", "Thank you for your payment. Please check your booking page for confirmation of the amount and status."],
  ["Send your advert", "Please send your advert as an MP4 video or a PNG or JPEG image in 16:9, at least 768 x 432 pixels. The video length should match your booking. The screen plays without sound."],
  ["Advert needs changes", "Your advert needs a few changes before it can go on screen. Please check the review notes on your booking page and send an updated file."],
  ["New price", "Thank you for your enquiry. We can price the dates, advert length and number of plays you need. Please share your preferred plan, or use our booking page to see the price."],
] as const;
type Memory = { templates: Map<string, Template>; meta: Map<string, ThreadMeta>; notes: Map<string, ClientNote>; links: Map<string, ClientLink>; signatures: Map<string, string> };
const shared = globalThis as typeof globalThis & { kcaMailBusiness?: Memory };
function memory(): Memory {
  return shared.kcaMailBusiness ??= { templates: new Map(STARTER_REPLIES.map(([name, body], i) => { const id = `starter-${i}`; return [id, { id, name, body, sort_order: i, created_by: null }]; })), meta: new Map(), notes: new Map(), links: new Map(), signatures: new Map() };
}
const fail = () => new MailError("Mail workspace data could not be saved or loaded. Check that migration 0007 is available, then try again.");
const fail9 = (what: string) => new MailError(`${what} could not be saved. Check that migration 0009 is applied, then try again.`);
/** A conversation as the workspace stores it. Without a party the key is the subject alone, as before. */
function keyOf(subject: string, party?: string) {
  if (typeof subject !== "string" || !subject.trim() || subject.length > 500 || (party !== undefined && (typeof party !== "string" || party.length > 254))) throw new MailError("Choose a conversation.");
  return conversationKey(subject, party ?? "");
}
async function patchMeta(accountId: string, key: string, patch: Partial<ThreadMeta>, what: string): Promise<ThreadMeta> {
  const row = { mailbox_id: accountId, thread_key: key, ...patch, updated_at: new Date().toISOString() };
  if (mailMemoryMode()) {
    const value = { assigned_email: null, ...memory().meta.get(`${accountId}:${key}`), ...row } as ThreadMeta;
    memory().meta.set(`${accountId}:${key}`, value); return structuredClone(value);
  }
  const { data, error } = await mailDb().from("mail_thread_meta").upsert(row, { onConflict: "mailbox_id,thread_key" }).select("*").single();
  if (error) throw fail9(what); return data as ThreadMeta;
}
export async function listTemplates(): Promise<Template[]> {
  if (mailMemoryMode()) return structuredClone([...memory().templates.values()].sort((a,b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
  const { data, error } = await mailDb().from("mail_templates").select("id,name,body,sort_order,created_by").order("sort_order").order("name");
  if (error) throw fail(); return data ?? [];
}
export async function saveTemplate(me: string, input: Pick<Template, "name" | "body" | "sort_order"> & { id?: string }): Promise<Template> {
  const name = String(input.name ?? "").trim(), body = String(input.body ?? "").trim();
  if (!name || name.length > 100 || !body || body.length > 10000 || !Number.isInteger(input.sort_order) || Math.abs(input.sort_order) > 100000) throw new MailError("Enter a name, reply text and a whole-number sort order.");
  const row = { name, body, sort_order: input.sort_order };
  if (mailMemoryMode()) {
    const old = input.id ? memory().templates.get(input.id) : null;
    if (input.id && !old) throw new MailError("That template no longer exists.");
    const value = { ...row, id: old?.id ?? randomUUID(), created_by: old ? old.created_by : emailKey(me) };
    memory().templates.set(value.id, value); return structuredClone(value);
  }
  const table = mailDb().from("mail_templates");
  const query = input.id ? table.update(row).eq("id", input.id) : table.insert({ ...row, created_by: emailKey(me) });
  const { data, error } = await query.select("id,name,body,sort_order,created_by").single();
  if (error) throw fail(); return data;
}
export async function deleteTemplate(id: string) {
  if (mailMemoryMode()) { memory().templates.delete(id); return; }
  const { error } = await mailDb().from("mail_templates").delete().eq("id", id);
  if (error) throw fail();
}
export async function listMeta(me: string, accountId: string): Promise<ThreadMeta[]> {
  await loadAccount(me, accountId);
  if (mailMemoryMode()) return structuredClone([...memory().meta.values()].filter((m) => m.mailbox_id === accountId));
  const { data, error } = await mailDb().from("mail_thread_meta").select("*").eq("mailbox_id", accountId);
  if (error) throw fail(); return data ?? [];
}
export async function assignThread(me: string, accountId: string, subject: string, assignee: string | null, party?: string) {
  await loadAccount(me, accountId);
  if (assignee !== null && !(await mailboxPeople(me, accountId)).some((p) => p.email === emailKey(assignee))) throw new MailError("Choose someone with access to this mailbox.");
  const row: ThreadMeta = { mailbox_id: accountId, thread_key: keyOf(subject, party), assigned_email: assignee === null ? null : emailKey(assignee), updated_at: new Date().toISOString() };
  if (mailMemoryMode()) memory().meta.set(`${accountId}:${row.thread_key}`, { ...memory().meta.get(`${accountId}:${row.thread_key}`), ...row });
  else { const { error } = await mailDb().from("mail_thread_meta").upsert(row, { onConflict: "mailbox_id,thread_key" }); if (error) throw fail(); }
  return row;
}
export async function clearAssignments(accountId: string, person: string) {
  for (const [key, row] of memory().meta) if (row.mailbox_id === accountId && row.assigned_email === person) memory().meta.set(key, { ...row, assigned_email: null, updated_at: new Date().toISOString() });
}
export async function setDone(me: string, accountId: string, subject: string, messageId: string | null, expectedMessageId?: string, party?: string) {
  await loadAccount(me, accountId);
  const key = keyOf(subject, party);
  if (!key || (messageId !== null && (!messageId || messageId.length > 1000))) throw new MailError("Choose a conversation.");
  const patch = { mailbox_id: accountId, thread_key: key, done_message_id: messageId, done_at: messageId ? new Date().toISOString() : null, done_by: messageId ? emailKey(me) : null, updated_at: new Date().toISOString() };
  if (mailMemoryMode()) {
    if (expectedMessageId && memory().meta.get(`${accountId}:${key}`)?.done_message_id !== expectedMessageId) throw new MailError("Undo failed. Someone has updated this conversation.");
    const row = { assigned_email: null, ...memory().meta.get(`${accountId}:${key}`), ...patch };
    memory().meta.set(`${accountId}:${key}`, row); return row;
  }
  const query = expectedMessageId ? mailDb().from("mail_thread_meta").update(patch).eq("mailbox_id", accountId).eq("thread_key", key).eq("done_message_id", expectedMessageId) : mailDb().from("mail_thread_meta").upsert(patch, { onConflict: "mailbox_id,thread_key" });
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw fail();
  if (!data) throw new MailError("Undo failed. Someone has updated this conversation.");
  return data as ThreadMeta;
}
export async function listNotes(): Promise<ClientNote[]> {
  if (mailMemoryMode()) return structuredClone([...memory().notes.values()]);
  const { data, error } = await mailDb().from("mail_client_notes").select("advertiser_email,note,updated_by,updated_at");
  if (error) throw fail(); return data ?? [];
}
export async function saveNote(me: string, email: string, text: string) {
  const key = emailKey(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) || key.length > 254 || typeof text !== "string" || text.length > 10000) throw new MailError("Enter a client email and a note up to 10,000 characters.");
  const row: ClientNote = { advertiser_email: key, note: text.trim(), updated_by: emailKey(me), updated_at: new Date().toISOString() };
  if (mailMemoryMode()) memory().notes.set(key, row);
  else { const { error } = await mailDb().from("mail_client_notes").upsert(row, { onConflict: "advertiser_email" }); if (error) throw fail(); }
  return row;
}

/** Hides a conversation from the inbox until a time, or brings it back with null. */
export async function snoozeThread(me: string, accountId: string, subject: string, party: string, until: string | null) {
  await loadAccount(me, accountId);
  const when = until === null ? null : new Date(until);
  if (when && (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() - 60_000 || when.getTime() > Date.now() + 366 * 86_400_000)) throw new MailError("Choose a time within the next year.");
  return patchMeta(accountId, keyOf(subject, party), { snoozed_until: when?.toISOString() ?? null, snoozed_by: when ? emailKey(me) : null }, "The snooze");
}
/** Lists the conversation under "No reply yet" from `at` unless the other party writes after `since`. */
export async function remindThread(me: string, accountId: string, subject: string, party: string, at: string | null, since = new Date().toISOString()) {
  await loadAccount(me, accountId);
  const when = at === null ? null : new Date(at);
  if (when && (!Number.isFinite(when.getTime()) || when.getTime() > Date.now() + 366 * 86_400_000)) throw new MailError("Choose a reminder within the next year.");
  if (when && !party) throw new MailError("A reminder needs a recipient outside this mailbox.");
  return patchMeta(accountId, keyOf(subject, party), { remind_at: when?.toISOString() ?? null, remind_since: when ? new Date(since).toISOString() : null, remind_by: when ? emailKey(me) : null }, "The reminder");
}

/* Sender addresses linked to booking clients by hand (migration 0009). */
export async function listLinks(): Promise<ClientLink[]> {
  if (mailMemoryMode()) return structuredClone([...memory().links.values()]);
  const { data, error } = await mailDb().from("mail_client_links").select("sender_email,client_id,linked_by,linked_at");
  if (error) throw new MailError("Client links could not be loaded. Check migration 0009.");
  return data ?? [];
}
export async function linkClient(me: string, sender: string, clientId: string | null) {
  const email = emailKey(String(sender ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new MailError("Choose a sender address.");
  if (clientId === null) {
    if (mailMemoryMode()) memory().links.delete(email);
    else { const { error } = await mailDb().from("mail_client_links").delete().eq("sender_email", email); if (error) throw fail9("The client link"); }
    return null;
  }
  const row: ClientLink = { sender_email: email, client_id: String(clientId).slice(0, 254), linked_by: emailKey(me), linked_at: new Date().toISOString() };
  if (mailMemoryMode()) { memory().links.set(email, row); return structuredClone(row); }
  const { error } = await mailDb().from("mail_client_links").upsert(row, { onConflict: "sender_email" });
  if (error) throw fail9("The client link");
  return row;
}

/* One signature per mailbox, shared by everyone who answers it (migration 0009). */
export async function readSignature(me: string, accountId: string): Promise<string> {
  await loadAccount(me, accountId);
  if (mailMemoryMode()) return memory().signatures.get(accountId) ?? "";
  const { data, error } = await mailDb().from("staff_mailboxes").select("signature").eq("id", accountId).maybeSingle();
  if (error) throw new MailError("The signature could not be loaded. Check migration 0009.");
  return (data as { signature?: string } | null)?.signature ?? "";
}
export async function saveSignature(me: string, accountId: string, text: string) {
  const account = await loadAccount(me, accountId);
  if (account.owner_email !== emailKey(me)) throw new MailError("Only the mailbox owner can change its signature.");
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (clean.length > 2000) throw new MailError("Keep the signature under 2,000 characters.");
  if (mailMemoryMode()) { memory().signatures.set(accountId, clean); return clean; }
  const { error } = await mailDb().from("staff_mailboxes").update({ signature: clean }).eq("id", accountId).eq("owner_email", emailKey(me));
  if (error) throw fail9("The signature");
  return clean;
}
