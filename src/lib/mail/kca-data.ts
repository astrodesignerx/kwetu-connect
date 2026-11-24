import { randomUUID } from "node:crypto";
import { mailDb, mailMemoryMode } from "./db";
import { MailError } from "./client";
import { loadAccount } from "./accounts";
import { emailKey, threadKey } from "./kca";

export type Template = { id: string; name: string; body: string; sort_order: number; created_by: string | null };
export type ThreadMeta = { mailbox_id: string; thread_key: string; assigned_email: string | null; updated_at: string };
export type ClientNote = { advertiser_email: string; note: string; updated_by: string; updated_at: string };
export const STARTER_REPLIES = [
  ["Advert approved", "Your advert has passed our review. You can check the booking status and planned dates on your booking page."],
  ["Payment received", "Thank you for your payment. Please check your booking page for confirmation of the amount and status."],
  ["Send your advert", "Please send your advert as an MP4 video or a PNG or JPEG image in 16:9, at least 768 x 432 pixels. The video length should match your booking. The screen plays without sound."],
  ["Advert needs changes", "Your advert needs a few changes before it can go on screen. Please check the review notes on your booking page and send an updated file."],
  ["New price", "Thank you for your enquiry. We can price the dates, advert length and number of plays you need. Please share your preferred plan, or use our booking page to see the price."],
] as const;
type Memory = { templates: Map<string, Template>; meta: Map<string, ThreadMeta>; notes: Map<string, ClientNote> };
const shared = globalThis as typeof globalThis & { kcaMailBusiness?: Memory };
function memory(): Memory {
  return shared.kcaMailBusiness ??= { templates: new Map(STARTER_REPLIES.map(([name, body], i) => { const id = `starter-${i}`; return [id, { id, name, body, sort_order: i, created_by: null }]; })), meta: new Map(), notes: new Map() };
}
const fail = () => new MailError("Mail workspace data could not be saved or loaded. Check that migration 0007 is available, then try again.");
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
  const { data, error } = await mailDb().from("mail_thread_meta").select("mailbox_id,thread_key,assigned_email,updated_at").eq("mailbox_id", accountId);
  if (error) throw fail(); return data ?? [];
}
export async function assignThread(me: string, accountId: string, subject: string, assignee: string | null) {
  await loadAccount(me, accountId);
  // Phase 1 mailboxes are personal. Assign only to their authenticated owner until sharing exists.
  if (assignee !== null && emailKey(assignee) !== emailKey(me)) throw new MailError("This personal mailbox can only be assigned to you.");
  if (typeof subject !== "string" || !subject.trim() || subject.length > 500) throw new MailError("Choose a conversation.");
  const row: ThreadMeta = { mailbox_id: accountId, thread_key: threadKey(subject), assigned_email: assignee === null ? null : emailKey(me), updated_at: new Date().toISOString() };
  if (mailMemoryMode()) memory().meta.set(`${accountId}:${row.thread_key}`, row);
  else { const { error } = await mailDb().from("mail_thread_meta").upsert(row, { onConflict: "mailbox_id,thread_key" }); if (error) throw fail(); }
  return row;
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
