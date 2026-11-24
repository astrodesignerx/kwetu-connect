import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MailError, type MailAccount, type Servers } from "./client";

/**
 * Where connected mailboxes are kept. Each mailbox belongs to one staff member (personal mailboxes, as in
 * the Mjengo suite): nobody else can list, open or remove it. With Supabase configured the rows live in
 * public.staff_mailboxes (service role only); without it, as in local demo mode, they live in memory.
 */
export interface AccountView { id: string; label: string; email: string }

const COLUMNS = "id, owner_email, label, email, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_enc, created_at";

function memoryMode() {
  return ![process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].every((s) => s?.trim());
}

type Shared = typeof globalThis & { kcaMailAccounts?: Map<string, MailAccount>; kcaMailDb?: SupabaseClient };
const shared = globalThis as Shared;
const memory = () => (shared.kcaMailAccounts ??= new Map());
function db() {
  return (shared.kcaMailDb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));
}
const view = (a: Pick<MailAccount, "id" | "label" | "email">): AccountView => ({ id: a.id, label: a.label, email: a.email });
const owner = (email: string) => email.trim().toLowerCase();
function failed(what: string, error: { code?: string } | null): never {
  console.error(`Staff mailbox ${what} failed:`, error?.code ?? "unknown");
  throw new MailError(`Unable to ${what} the mailbox. Please try again.`);
}

export async function listAccounts(ownerEmail: string): Promise<AccountView[]> {
  const me = owner(ownerEmail);
  if (memoryMode()) return [...memory().values()].filter((a) => a.owner_email === me).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(view);
  const { data, error } = await db().from("staff_mailboxes").select("id, label, email").eq("owner_email", me).order("created_at");
  if (error) failed("read", error);
  return (data ?? []).map(view);
}

/** The mailbox, only if it belongs to this person. */
export async function loadAccount(ownerEmail: string, id: string): Promise<MailAccount> {
  const me = owner(ownerEmail);
  if (memoryMode()) {
    const hit = memory().get(id);
    if (hit && hit.owner_email === me) return hit;
    throw new MailError("That mailbox is not connected.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new MailError("That mailbox is not connected.");
  const { data, error } = await db().from("staff_mailboxes").select(COLUMNS).eq("id", id).eq("owner_email", me).maybeSingle();
  if (error) failed("read", error);
  if (!data) throw new MailError("That mailbox is not connected.");
  return data as MailAccount;
}

/** Adds the mailbox, or replaces the saved password and servers if this person already connected it. */
export async function saveAccount(ownerEmail: string, input: Servers & { email: string; label: string; password_enc: string }): Promise<AccountView> {
  const me = owner(ownerEmail);
  if (memoryMode()) {
    const existing = [...memory().values()].find((a) => a.owner_email === me && a.email === input.email);
    const row: MailAccount = { ...input, id: existing?.id ?? randomUUID(), owner_email: me, created_at: existing?.created_at ?? new Date().toISOString() };
    memory().set(row.id, row);
    return view(row);
  }
  const { data, error } = await db().from("staff_mailboxes").upsert({ ...input, owner_email: me }, { onConflict: "owner_email,email" }).select("id, label, email").single();
  if (error || !data) failed("save", error);
  return view(data);
}

export async function removeAccount(ownerEmail: string, id: string): Promise<void> {
  const me = owner(ownerEmail);
  if (memoryMode()) {
    if (memory().get(id)?.owner_email === me) memory().delete(id);
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { error } = await db().from("staff_mailboxes").delete().eq("id", id).eq("owner_email", me);
  if (error) failed("remove", error);
}
