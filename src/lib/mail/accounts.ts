import { randomUUID } from "node:crypto";
import { mailDb as db, mailMemoryMode as memoryMode } from "./db";
import { MailError, type MailAccount, type Servers } from "./client";

/** Credentials stay on the server. Every mailbox entry point uses loadAccount. */
export interface AccountView { id: string; label: string; email: string; owner_email?: string; last_synced_at?: string | null; last_unread_count?: number; last_error?: string | null }
export type StaffPerson = { email: string; name: string };

const COLUMNS = "last_synced_at, last_unread_count, last_error, last_error_at, id, owner_email, label, email, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_enc, created_at";

type Shared = typeof globalThis & { kcaMailAccounts?: Map<string, MailAccount>; kcaMailMembers?: Map<string, Set<string>>; kcaMailStaff?: Map<string, string> };
const shared = globalThis as Shared;
const memory = () => (shared.kcaMailAccounts ??= new Map());
const members = () => shared.kcaMailMembers ??= new Map();
const view = (a: AccountView): AccountView => ({ id: a.id, label: a.label, email: a.email, owner_email: a.owner_email, last_synced_at: a.last_synced_at, last_unread_count: a.last_unread_count, last_error: a.last_error });
const owner = (email: string) => email.trim().toLowerCase();
function failed(what: string, error: { code?: string } | null): never {
  console.error(`Staff mailbox ${what} failed:`, error?.code ?? "unknown");
  throw new MailError(`Unable to ${what} the mailbox. Please try again.`);
}

export async function listAccounts(ownerEmail: string): Promise<AccountView[]> {
  const me = owner(ownerEmail);
  if (memoryMode()) return [...memory().values()].filter((a) => a.owner_email === me || members().get(a.id)?.has(me)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(view);
  const { data: grants, error: grantError } = await db().from("mail_mailbox_members").select("mailbox_id").eq("staff_email", me);
  if (grantError) failed("read", grantError);
  const ids = (grants ?? []).map((g) => g.mailbox_id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const { data, error } = await db().from("staff_mailboxes").select("id, owner_email, label, email, last_synced_at, last_unread_count, last_error").or(`owner_email.eq.${me}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`).order("created_at");
  if (error) failed("read", error);
  return (data ?? []).map(view);
}

/** Missing and inaccessible mailboxes have exactly the same response. */
export async function loadAccount(ownerEmail: string, id: string): Promise<MailAccount> {
  const me = owner(ownerEmail);
  if (memoryMode()) {
    const hit = memory().get(id);
    if (hit && (hit.owner_email === me || members().get(id)?.has(me))) return hit;
    throw new MailError("That mailbox is not connected.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new MailError("That mailbox is not connected.");
  const { data, error } = await db().from("staff_mailboxes").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) failed("read", error);
  if (!data) throw new MailError("That mailbox is not connected.");
  if (data.owner_email !== me) {
    const { data: grant, error: grantError } = await db().from("mail_mailbox_members").select("mailbox_id").eq("mailbox_id", id).eq("staff_email", me).maybeSingle();
    if (grantError) failed("read", grantError);
    if (!grant) throw new MailError("That mailbox is not connected.");
  }
  return data as MailAccount;
}

/** Adds the mailbox, or replaces the saved password and servers if this person already connected it. */
export async function saveAccount(ownerEmail: string, input: Servers & { email: string; label: string; password_enc: string }): Promise<AccountView> {
  const me = owner(ownerEmail);
  if ((await listAccounts(me)).some((a) => a.email === input.email && a.owner_email && a.owner_email !== me)) throw new MailError("Only the mailbox owner can change these settings.");
  if (memoryMode()) {
    const existing = [...memory().values()].find((a) => a.owner_email === me && a.email === input.email);
    const row: MailAccount = { ...input, id: existing?.id ?? randomUUID(), owner_email: me, created_at: existing?.created_at ?? new Date().toISOString() };
    memory().set(row.id, row);
    return view(row);
  }
  const { data, error } = await db().from("staff_mailboxes").upsert({ ...input, label: input.label.slice(0, 60), owner_email: me }, { onConflict: "owner_email,email" }).select("id, label, email, last_synced_at, last_unread_count, last_error").single();
  if (error || !data) failed("save", error);
  return view(data);
}

export async function removeAccount(ownerEmail: string, id: string): Promise<void> {
  const me = owner(ownerEmail);
  await ownedAccount(me, id);
  if (memoryMode()) {
    memory().delete(id); members().delete(id);
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { error } = await db().from("staff_mailboxes").delete().eq("id", id).eq("owner_email", me);
  if (error) failed("remove", error);
}

export async function ownedAccount(me: string, id: string) {
  const account = await loadAccount(me, id);
  if (account.owner_email !== owner(me)) throw new MailError("Only the mailbox owner can change these settings.");
  return account;
}
export async function staffDirectory(): Promise<StaffPerson[]> {
  if (memoryMode()) return [...(shared.kcaMailStaff ?? new Map()).entries()].map(([email, name]) => ({ email, name }));
  const { data, error } = await db().from("staff").select("email,name").order("name");
  if (error) failed("read", error);
  return data ?? [];
}
export async function mailboxPeople(me: string, id: string): Promise<StaffPerson[]> {
  const account = await loadAccount(me, id);
  let emails: string[];
  if (memoryMode()) emails = [...(members().get(id) ?? [])];
  else {
    const { data, error } = await db().from("mail_mailbox_members").select("staff_email").eq("mailbox_id", id);
    if (error) failed("read", error);
    emails = (data ?? []).map((m) => m.staff_email);
  }
  const names = new Map((await staffDirectory()).map((p) => [p.email, p.name]));
  return [...new Set([account.owner_email, ...emails])].map((email) => ({ email, name: names.get(email) || email }));
}
export async function addMember(me: string, id: string, email: string) {
  const account = await ownedAccount(me, id);
  const person = owner(email);
  if (person === account.owner_email) return;
  if (!(await staffDirectory()).some((s) => s.email === person)) throw new MailError("Choose someone from the staff list.");
  if (memoryMode()) { const set = members().get(id) ?? new Set(); set.add(person); members().set(id, set); return; }
  const { error } = await db().from("mail_mailbox_members").upsert({ mailbox_id: id, staff_email: person, added_by: owner(me) });
  if (error) failed("share", error);
}
export async function removeMember(me: string, id: string, email: string) {
  const account = await loadAccount(me, id), person = owner(email);
  if (person === account.owner_email || (account.owner_email !== owner(me) && person !== owner(me))) throw new MailError("Only the mailbox owner can change its members.");
  if (memoryMode()) {
    members().get(id)?.delete(person);
    const { clearAssignments } = await import("./kca-data");
    await clearAssignments(id, person);
    return;
  }
  // Migration 0008 clears assignments in the same database transaction.
  const { error } = await db().from("mail_mailbox_members").delete().eq("mailbox_id", id).eq("staff_email", person);
  if (error) failed("update", error);
}
export async function renameAccount(me: string, id: string, label: string) {
  await ownedAccount(me, id);
  const clean = String(label).trim().slice(0, 60);
  if (!clean) throw new MailError("Enter a mailbox name.");
  if (memoryMode()) { memory().get(id)!.label = clean; return; }
  const { error } = await db().from("staff_mailboxes").update({ label: clean }).eq("id", id).eq("owner_email", owner(me));
  if (error) failed("rename", error);
}

/** Used only by the secret-protected cron route. Credentials stay on the server. */
export async function accountsToWatch(before = new Date().toISOString(), limit = 4): Promise<MailAccount[]> {
  if (memoryMode()) return [];
  const { data, error } = await db().from("staff_mailboxes").select(COLUMNS).or(`last_checked_at.is.null,last_checked_at.lt.${before}`).order("last_checked_at", { nullsFirst: true }).limit(limit);
  if (error) failed("read", error);
  return data as MailAccount[];
}
export async function recordSync(id: string, unread: number | null, errorText: string | null) {
  const patch = { last_checked_at: new Date().toISOString(), ...(unread === null ? { last_error: errorText, last_error_at: new Date().toISOString() } : { last_unread_count: unread, last_synced_at: new Date().toISOString(), last_error: null, last_error_at: null }) };
  if (memoryMode()) { const row = memory().get(id); if (row) memory().set(id, { ...row, ...patch }); return; }
  const { error } = await db().from("staff_mailboxes").update(patch).eq("id", id);
  if (error) failed("update", error);
}
export async function cachedUnread(ownerEmail: string) {
  return (await listAccounts(ownerEmail)).reduce((n, a) => n + (a.last_unread_count ?? 0), 0);
}
