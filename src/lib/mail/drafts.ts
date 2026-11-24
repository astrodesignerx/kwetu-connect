import { createHash, randomUUID } from "node:crypto";
import { mailDb, mailMemoryMode } from "./db";
import { loadAccount } from "./accounts";
import { MailError, MAX_ATTACHMENT_BYTES } from "./client";

export interface DraftData {
  title: string; to: string; cc: string; subject: string; body: string;
  quoted?: string; inReplyTo?: string | null; references?: string[];
  answers?: { mailbox: string; uid: number }; uploadIds: string[];
}
export interface SavedDraft {
  id: string; owner_email: string; mailbox_id: string; data: DraftData;
  row_version: number; created_at: string; updated_at: string;
  send_state: "draft" | "sending" | "sent" | "uncertain"; send_hash: string | null;
}
export interface Upload {
  id: string; owner_email: string; draft_id: string; file_name: string;
  content_type: string; size_bytes: number; data_base64: string; created_at: string;
}
export type UploadView = Pick<Upload, "id" | "file_name" | "size_bytes">;
const shared = globalThis as typeof globalThis & { kcaMailDrafts?: Map<string, SavedDraft>; kcaMailUploads?: Map<string, Upload> };
const drafts = () => shared.kcaMailDrafts ??= new Map();
const uploads = () => shared.kcaMailUploads ??= new Map();
export const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export class DraftConflict extends MailError {
  constructor() { super("This draft changed elsewhere. Close it and reopen it from Drafts before saving again."); }
}
function failed(error: unknown): never {
  // Database details can contain message data, so they never enter logs or responses.
  void error;
  throw new MailError("Mail storage could not be updated. Please try again.");
}
function cleanData(input: DraftData): DraftData {
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  return {
    title: clip(input.title, 80), to: clip(input.to, 4000), cc: clip(input.cc, 4000), subject: clip(input.subject, 300),
    body: clip(input.body, 500_000), quoted: clip(input.quoted, 500_000), inReplyTo: clip(input.inReplyTo, 500) || null,
    references: (Array.isArray(input.references) ? input.references : []).slice(-20).map((r) => clip(r, 500)),
    answers: input.answers && Number.isInteger(input.answers.uid) && input.answers.uid > 0 && typeof input.answers.mailbox === "string" && input.answers.mailbox.length <= 200 ? input.answers : undefined,
    uploadIds: [...new Set((Array.isArray(input.uploadIds) ? input.uploadIds : []).filter(validId))].slice(0, 10),
  };
}
export async function getDraft(owner: string, id: string): Promise<SavedDraft | null> {
  if (!validId(id)) return null;
  if (mailMemoryMode()) { const row = drafts().get(id); if (row?.owner_email !== owner) return null; await loadAccount(owner, row.mailbox_id); return structuredClone(row); }
  const { data, error } = await mailDb().from("mail_drafts").select("*").eq("owner_email", owner).eq("id", id).maybeSingle();
  if (error) failed(error);
  if (data) await loadAccount(owner, data.mailbox_id);
  return data as SavedDraft | null;
}
export async function listDrafts(owner: string, accountId: string): Promise<SavedDraft[]> {
  await loadAccount(owner, accountId);
  if (mailMemoryMode()) return [...drafts().values()].filter((r) => r.owner_email === owner && r.mailbox_id === accountId && r.send_state !== "sent").sort((a,b) => b.updated_at.localeCompare(a.updated_at)).map((r) => structuredClone(r));
  const { data, error } = await mailDb().from("mail_drafts").select("*").eq("owner_email", owner).eq("mailbox_id", accountId).neq("send_state", "sent").order("updated_at", { ascending: false });
  if (error) failed(error);
  return data as SavedDraft[];
}
export async function saveDraft(owner: string, id: string, accountId: string, version: number, input: DraftData): Promise<SavedDraft> {
  if (!validId(id) || !Number.isInteger(version) || version < 0) throw new DraftConflict();
  await loadAccount(owner, accountId);
  const data = cleanData(input);
  const now = new Date().toISOString();
  if (mailMemoryMode()) {
    const old = drafts().get(id);
    if (old && (old.owner_email !== owner || old.mailbox_id !== accountId || old.row_version !== version || old.send_state !== "draft")) throw new DraftConflict();
    if (!old && version !== 0) throw new DraftConflict();
    const row: SavedDraft = { id, owner_email: owner, mailbox_id: accountId, data, row_version: version + 1, created_at: old?.created_at ?? now, updated_at: now, send_state: "draft", send_hash: null };
    drafts().set(id, row);
    return structuredClone(row);
  }
  if (version === 0) {
    const { data: row, error } = await mailDb().from("mail_drafts").insert({ id, owner_email: owner, mailbox_id: accountId, data }).select("*").single();
    if (error?.code === "23505") throw new DraftConflict();
    if (error) failed(error);
    return row as SavedDraft;
  }
  const { data: row, error } = await mailDb().from("mail_drafts").update({ data, row_version: version + 1, updated_at: now })
    .eq("id", id).eq("owner_email", owner).eq("mailbox_id", accountId).eq("row_version", version).eq("send_state", "draft").select("*").maybeSingle();
  if (error) failed(error);
  if (!row) throw new DraftConflict();
  return row as SavedDraft;
}

/** An atomic database claim prevents two Vercel invocations from submitting the same draft. */
export async function sendOnce(owner: string, id: string, accountId: string, version: number, payload: unknown, send: () => Promise<void>) {
  await loadAccount(owner, accountId);
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const row = await getDraft(owner, id);
  if (!row || row.mailbox_id !== accountId) throw new MailError("Save this email to Drafts before sending.");
  if (row.send_state === "sent" && row.send_hash === hash) return false;
  if (row.send_state !== "draft") throw new MailError("Sending was already started. Check Sent before creating another email.");
  if (row.row_version !== version) throw new DraftConflict();
  if (mailMemoryMode()) {
    const current = drafts().get(id)!;
    if (current.row_version !== version || current.send_state !== "draft") throw new DraftConflict();
    drafts().set(id, { ...current, row_version: version + 1, send_state: "sending", send_hash: hash });
  } else {
    const { data, error } = await mailDb().from("mail_drafts").update({ send_state: "sending", send_hash: hash, row_version: version + 1 })
      .eq("id", id).eq("owner_email", owner).eq("row_version", version).eq("send_state", "draft").select("id").maybeSingle();
    if (error) failed(error);
    if (!data) throw new DraftConflict();
  }
  const finish = async (state: "sent" | "uncertain") => {
    if (mailMemoryMode()) { const current = drafts().get(id)!; drafts().set(id, { ...current, send_state: state }); return; }
    const { error } = await mailDb().from("mail_drafts").update({ send_state: state, sent_at: state === "sent" ? new Date().toISOString() : null })
      .eq("id", id).eq("owner_email", owner).eq("send_state", "sending");
    if (error) failed(error);
  };
  try { await send(); } catch {
    await finish("uncertain").catch(() => undefined);
    throw new MailError("Sending could not be confirmed. Check Sent before creating another email.");
  }
  // A failed receipt write keeps the claim locked, so a retry cannot send twice.
  await finish("sent");
  return true;
}
export async function deleteDraft(owner: string, id: string, version: number) {
  const row = await getDraft(owner, id);
  if (!row || row.row_version !== version || row.send_state !== "draft") throw new DraftConflict();
  if (mailMemoryMode()) {
    drafts().delete(id);
    for (const [key, u] of uploads()) if (u.owner_email === owner && u.draft_id === id) uploads().delete(key);
  } else {
    const { data, error } = await mailDb().from("mail_drafts").delete().eq("id", id).eq("owner_email", owner).eq("row_version", version).eq("send_state", "draft").select("id").maybeSingle();
    if (error) failed(error);
    if (!data) throw new DraftConflict();
  }
}
export async function cleanUploads() {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  if (mailMemoryMode()) { for (const [id, u] of uploads()) if (u.created_at < cutoff) uploads().delete(id); return; }
  const { error } = await mailDb().from("mail_uploads").delete().lt("created_at", cutoff);
  if (error) failed(error);
}
export async function saveUpload(owner: string, draftId: string, file: File): Promise<UploadView> {
  const row = await getDraft(owner, draftId);
  if (!row || row.send_state !== "draft") throw new DraftConflict();
  if (file.size > MAX_ATTACHMENT_BYTES) throw new MailError("Each attachment can be up to 4 MB.");
  await cleanUploads();
  const upload: Upload = { id: randomUUID(), owner_email: owner, draft_id: draftId, file_name: (file.name || "attachment").slice(0, 200), content_type: (file.type || "application/octet-stream").slice(0, 120), size_bytes: file.size, data_base64: Buffer.from(await file.arrayBuffer()).toString("base64"), created_at: new Date().toISOString() };
  if (mailMemoryMode()) uploads().set(upload.id, upload);
  else { const { error } = await mailDb().from("mail_uploads").insert(upload); if (error) failed(error); }
  return { id: upload.id, file_name: upload.file_name, size_bytes: upload.size_bytes };
}
export async function loadUploads(owner: string, draftId: string, ids: string[]): Promise<Upload[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length > 10 || wanted.some((id) => !validId(id))) throw new MailError("Choose up to ten attachments.");
  if (!wanted.length) return [];
  if (!await getDraft(owner, draftId)) throw new MailError("An attachment expired or is unavailable. Remove it and attach it again.");
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  let rows: Upload[];
  if (mailMemoryMode()) rows = wanted.map((id) => uploads().get(id)).filter((u): u is Upload => !!u && u.owner_email === owner && u.draft_id === draftId && u.created_at >= cutoff);
  else {
    const { data, error } = await mailDb().from("mail_uploads").select("*").eq("owner_email", owner).eq("draft_id", draftId).in("id", wanted).gte("created_at", cutoff);
    if (error) failed(error);
    rows = data as Upload[];
  }
  if (rows.length !== wanted.length) throw new MailError("An attachment expired or is unavailable. Remove it and attach it again.");
  return wanted.map((id) => rows.find((u) => u.id === id)!);
}
