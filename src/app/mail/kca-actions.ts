"use server";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { MailError } from "@/lib/mail/client";
import { clientsFrom, emailKey, threadKey } from "@/lib/mail/kca";
import { listTemplates, saveTemplate, deleteTemplate, listMeta, assignThread, listNotes, saveNote, setDone, type Template } from "@/lib/mail/kca-data";
import { conversationRows } from "@/lib/mail/conversations";
import { loadAccount, listAccounts, mailboxPeople } from "@/lib/mail/accounts";
import { mailThread } from "./actions";
import { messageIdentity } from "@/lib/mail/status";
import { todayInNairobi } from "@/lib/store/validation";
import type { Result } from "./actions";

async function run<T>(fn: (me: string) => Promise<T>): Promise<Result<T>> {
  const { email } = await requireStaff("/mail");
  try { return { ok: true, data: await fn(email) }; }
  catch (error) { return { ok: false, error: error instanceof MailError ? error.message : "Mail business data is unavailable. You can still read and send mail. Try again shortly." }; }
}
export async function mailWorkspace(accountId: string) {
  return run(async (me) => {
    await loadAccount(me, accountId);
    const [directory, templates, notes, meta, people] = await Promise.allSettled([getStore().mailDirectory(), listTemplates(), listNotes(), listMeta(me, accountId), mailboxPeople(me, accountId)]);
    return { me: emailKey(me), today: todayInNairobi(), directory: directory.status === "fulfilled" ? directory.value : null,
      templates: templates.status === "fulfilled" ? templates.value : [], notes: notes.status === "fulfilled" ? notes.value : [], meta: meta.status === "fulfilled" ? meta.value : [], people: people.status === "fulfilled" ? people.value : [],
      errors: [directory.status === "rejected" ? "Bookings could not be loaded. Mail is still available." : "", templates.status === "rejected" ? "Quick replies could not be loaded. Check migration 0007." : "", notes.status === "rejected" ? "Client notes could not be loaded." : "", meta.status === "rejected" ? "Assignments could not be loaded." : ""].filter(Boolean) };
  });
}
export async function mailWaiting() { return run((me) => conversationRows(me, { kind: "waiting" })); }
export async function mailClientConversations(emails: string[]) {
  return run(async (me) => {
    if (!Array.isArray(emails) || emails.length > 20 || emails.some((e) => typeof e !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new MailError("Choose a client email.");
    return conversationRows(me, { kind: "client", emails: emails.map(emailKey) });
  });
}
export async function mailAssigned(accountId?: string) {
  return run(async (me) => {
    if (accountId) await loadAccount(me, accountId);
    const results = await Promise.all((await listAccounts(me)).map(async (a) => {
      const meta = await listMeta(me, a.id);
      return conversationRows(me, { kind: "assigned", subjects: meta.filter((m) => m.assigned_email === emailKey(me)).map((m) => m.thread_key) }, a.id);
    }));
    return { items: results.flatMap((r) => r.items), errors: results.flatMap((r) => r.errors), partial: results.some((r) => r.partial) };
  });
}
export async function mailDone(accountId: string, mailbox: string, uid: number, subject: string) {
  return run(async (me) => {
    await loadAccount(me, accountId);
    const result = await mailThread(accountId, mailbox, uid, subject);
    if (!result.ok) throw new MailError(result.error);
    const latest = result.data.at(-1);
    if (!latest) throw new MailError("That message is no longer there.");
    return setDone(me, accountId, latest.subject, messageIdentity(latest));
  });
}
export async function mailUndoDone(accountId: string, subject: string, messageId: string) {
  return run(async (me) => {
    const current = (await listMeta(me, accountId)).find((m) => m.thread_key === threadKey(subject));
    if (current?.done_message_id !== messageId) throw new MailError("Undo failed. Someone has updated this conversation.");
    return setDone(me, accountId, subject, null, messageId);
  });
}
export async function mailAssign(accountId: string, subject: string, assignee: string | null) { return run((me) => assignThread(me, accountId, subject, assignee)); }
export async function mailSaveNote(email: string, note: string) {
  return run(async (me) => {
    const data = await getStore().mailDirectory();
    if (!clientsFrom(data).some((c) => c.emails.includes(emailKey(email)))) throw new MailError("That email does not match a booking client.");
    return saveNote(me, email, note);
  });
}
export async function mailSaveTemplate(input: Pick<Template, "name" | "body" | "sort_order"> & { id?: string }) { return run((me) => saveTemplate(me, input)); }
export async function mailDeleteTemplate(id: string) { return run(async () => { await deleteTemplate(String(id)); return true; }); }
