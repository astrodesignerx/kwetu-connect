"use client";
import { useEffect, useId, useRef, useState } from "react";
import { mailSaveDraft, mailSend, mailDraftUploads, mailDeleteDraft } from "@/app/mail/actions";
import type { DraftData, SavedDraft, UploadView } from "@/lib/mail/drafts";
import { mailRequest } from "./mail-request";
import { fileSize, splitAddresses, textToHtml } from "./mail-format";
import type { Template } from "@/lib/mail/kca-data";

export interface Draft extends Partial<DraftData> { title: string; to: string; cc: string; subject: string; saved?: SavedDraft }

export default function MailCompose({ accountId, from, draft, onSent, onClose, templates = [] }: { accountId: string; from: string; draft: Draft; onSent: () => void; onClose: () => void; templates?: Template[] }) {
  const label = useId();
  const [id] = useState(() => draft.saved?.id ?? crypto.randomUUID());
  const [data, setData] = useState<DraftData>(() => ({ title: draft.title, to: draft.to, cc: draft.cc, subject: draft.subject, body: draft.body ?? "", quoted: draft.quoted, inReplyTo: draft.inReplyTo, references: draft.references, answers: draft.answers, uploadIds: draft.uploadIds ?? [] }));
  const [files, setFiles] = useState<UploadView[]>([]);
  const [notice, setNotice] = useState("Saving draft");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(!!draft.saved && draft.saved.send_state !== "draft");
  const version = useRef(draft.saved?.row_version ?? 0);
  const current = useRef(data);
  const queue = useRef<Promise<SavedDraft | null>>(Promise.resolve(null));
  const blocked = useRef(!!draft.saved && draft.saved.send_state !== "draft");
  const locked = useRef(false);
  const alive = useRef(true);
  const body = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = (next: Partial<DraftData>) => { const value = { ...current.current, ...next }; current.current = value; setData(value); };

  function save() {
    queue.current = queue.current.then(async () => {
      if (blocked.current) return null;
      const result = await mailSaveDraft(id, accountId, version.current, current.current);
      if (!result.ok) { blocked.current = true; setStopped(true); if (alive.current) { setError(result.error); setNotice("Draft not saved"); } return null; }
      version.current = result.data.row_version;
      if (alive.current) setNotice("Draft saved");
      return result.data;
    }).catch(() => { blocked.current = true; setStopped(true); if (alive.current) setError("The draft could not be saved. Keep this window open and copy your message before reloading."); return null; });
    return queue.current;
  }
  useEffect(() => {
    const timer = setTimeout(() => { if (!locked.current) void save(); }, 650);
    return () => clearTimeout(timer);
    // A save reads the latest form and serialises behind any earlier save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    if (!draft.uploadIds?.length) return;
    void mailRequest(mailDraftUploads(id, draft.uploadIds)).then((r) => { if (r.ok) setFiles(r.data); else setError(r.error); });
  }, [draft.uploadIds, id]);

  async function close() {
    if (busy) return;
    if (blocked.current) { onClose(); return; }
    setBusy(true); locked.current = true;
    const result = await save();
    if (result) onClose();
    else { setBusy(false); locked.current = false; }
  }
  async function attach(picked: File[]) {
    if (picked.some((f) => f.size > 4 * 1024 * 1024)) { setError("Each attachment can be up to 4 MB."); return; }
    if (current.current.uploadIds.length + picked.length > 10) { setError("Choose up to ten attachments."); return; }
    setBusy(true); locked.current = true; setError("");
    try {
      if (!await save()) return;
      for (const file of picked) {
        const form = new FormData(); form.set("file", file); form.set("draftId", id);
        const response = await fetch("/mail/upload", { method: "POST", body: form });
        if (!response.ok) throw new Error(await response.text());
        const upload = await response.json() as UploadView;
        change({ uploadIds: [...current.current.uploadIds, upload.id] });
        setFiles((old) => [...old, upload]);
      }
      await save();
    } catch (e) { setError(e instanceof Error ? e.message : "The attachment could not be uploaded."); }
    finally { setBusy(false); locked.current = false; }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked.current) return;
    setError("");
    if (!data.body.trim() && !data.quoted) { setError("Write a message first."); return; }
    locked.current = true; setBusy(true);
    try {
      const row = await save();
      if (!row) return;
      const value = current.current;
      const result = await mailSend({ accountId, draftId: id, expectedVersion: row.row_version, to: splitAddresses(value.to), cc: splitAddresses(value.cc), subject: value.subject, html: textToHtml(value.body) + (value.quoted ?? ""), inReplyTo: value.inReplyTo, references: value.references, answers: value.answers, uploadIds: value.uploadIds });
      if (result.ok) onSent();
      else { setError(result.error); if (/already started|could not be confirmed/.test(result.error)) { blocked.current = true; setStopped(true); } }
    } catch { blocked.current = true; setStopped(true); setError("Sending could not be confirmed. Check Sent before creating another email."); }
    finally { setBusy(false); locked.current = false; }
  }
  async function discard() {
    if (busy || blocked.current) return;
    setBusy(true); locked.current = true;
    const row = await save();
    if (row) { const result = await mailDeleteDraft(id, row.row_version); if (result.ok) { onClose(); return; } setError(result.error); }
    setBusy(false); locked.current = false;
  }
  const readOnly = busy || stopped;
  return <form className="mg-mail-compose" aria-labelledby={label} onSubmit={send} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.requestSubmit(); } }}>
    <header className="mg-mail-compose-head"><h2 id={label}>{draft.title}</h2><button type="button" disabled={busy} onClick={() => void close()} aria-label="Save and close">Close</button></header>
    <p>From {from}</p>
    {draft.saved && draft.saved.send_state !== "draft" && <p role="alert">Sending was already started. Check Sent before creating another email. This copy cannot be sent again.</p>}
    <label className="mg-mail-field">To<input name="to" value={data.to} required disabled={readOnly} autoComplete="off" onChange={(e) => change({ to: e.target.value })} /></label>
    <label className="mg-mail-field">Copy<input name="cc" value={data.cc} disabled={readOnly} autoComplete="off" onChange={(e) => change({ cc: e.target.value })} /></label>
    <label className="mg-mail-field">Subject<input name="subject" maxLength={300} value={data.subject} disabled={readOnly} onChange={(e) => change({ subject: e.target.value })} /></label>
    <label className="mg-mail-field">Quick reply<select aria-label="Insert quick reply" value="" disabled={readOnly || !templates.length} onChange={(e) => { const template=templates.find((t) => t.id===e.target.value); if(!template) return; const start=body.current?.selectionStart ?? current.current.body.length, end=body.current?.selectionEnd ?? start; const old=current.current.body; const next=old.slice(0,start)+template.body+old.slice(end); if(next.length>500000) {setError("The message is too long for this quick reply.");return;} change({body:next}); const caret=start+template.body.length;  requestAnimationFrame(() => {body.current?.focus();body.current?.setSelectionRange(caret,caret);}); }}><option value="">{templates.length ? "Choose a template" : "No quick replies available"}</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="mg-mail-field">Message<textarea ref={body} name="body" rows={8} maxLength={500000} value={data.body} disabled={readOnly} onChange={(e) => change({ body: e.target.value })} autoFocus /></label>
    {data.quoted && <p>The earlier message is included below yours.{draft.title === "Forward" ? " Attach any files you want to forward." : ""}</p>}
    <ul className="mg-mail-files" aria-label="Attached files">{data.uploadIds.map((uploadId) => { const f = files.find((x) => x.id === uploadId); return <li key={uploadId}>{f?.file_name ?? "Attachment"} ({f ? fileSize(f.size_bytes) : "unavailable"}) <button type="button" disabled={readOnly} onClick={() => change({ uploadIds: current.current.uploadIds.filter((x) => x !== uploadId) })}>Remove</button></li>; })}</ul>
    {error && <p className="mg-mail-error" role="alert">{error}</p>}
    <footer className="mg-mail-form-actions"><button type="submit" className="mg-primary" disabled={readOnly}>{busy ? "Please wait" : "Send"}</button>
      <label>Attach files<input type="file" multiple disabled={readOnly} onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void attach(picked); }} /></label>
      <button type="button" onClick={() => void discard()} disabled={readOnly}>Discard</button><small role="status">{notice}</small>
    </footer>
  </form>;
}
