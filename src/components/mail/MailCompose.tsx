"use client";
import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { mailSaveDraft, mailSend, mailDraftUploads, mailDeleteDraft } from "@/app/mail/actions";
import type { DraftData, SavedDraft, UploadView } from "@/lib/mail/drafts";
import { mailRequest } from "./mail-request";
import { fileSize, splitAddresses, textToHtml } from "./mail-format";
import MailIcon from "./MailIcon";
import { holdSend } from "./send-hold";
import type { ReplyKind } from "./MailReader";
import type { Template } from "@/lib/mail/kca-data";

export interface Draft extends Partial<DraftData> { title: string; to: string; cc: string; subject: string; saved?: SavedDraft }

export type MailComposeHandle = { insert: (text: string) => void; close: () => void };
export default function MailCompose({ accountId, from, draft, onSent, onClose, templates = [], modes, onHold, ref }: { accountId: string; from: string; draft: Draft; onSent: () => void; onClose: () => void; templates?: Template[]; modes?: Partial<Record<ReplyKind,Draft>>; onHold?: (undo:()=>void)=>void; ref?: React.Ref<MailComposeHandle> }) {
  const label = useId();
  const [id] = useState(() => draft.saved?.id ?? crypto.randomUUID());
  const [data, setData] = useState<DraftData>(() => ({ title: draft.title, to: draft.to, cc: draft.cc, subject: draft.subject, body: draft.body ?? "", quoted: draft.quoted, inReplyTo: draft.inReplyTo, references: draft.references, answers: draft.answers, uploadIds: draft.uploadIds ?? [] }));
  const [holding, setHolding] = useState(false);
  const cancelHold = useRef<(() => boolean) | null>(null);
  const undoHold = useRef<(() => void) | null>(null);
  const [files, setFiles] = useState<UploadView[]>([]);
  const [notice, setNotice] = useState(draft.saved ? "Draft saved" : "");
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
  // A reply opened and closed untouched is not kept: nothing is stored until something changes.
  const stored = useRef(!!draft.saved);
  const [untouched] = useState(() => JSON.stringify(data));
  const pristine = () => !stored.current && JSON.stringify(current.current) === untouched;
  const closing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelHold.current?.(); }; }, []);
  const change = (next: Partial<DraftData>) => {
    const value = { ...current.current, ...next }; current.current = value; setData(value);
    if (!blocked.current) setNotice(pristine() ? "" : "Saving draft");
  };

  function insert(text: string) {
    const start = body.current?.selectionStart ?? current.current.body.length, end = body.current?.selectionEnd ?? start;
    change({body:current.current.body.slice(0,start) + text + current.current.body.slice(end)});
    requestAnimationFrame(() => { body.current?.focus(); body.current?.setSelectionRange(start+text.length,start+text.length); });
  }
  useImperativeHandle(ref, () => ({insert, close: () => {void close();}}));

  function save() {
    queue.current = queue.current.then(async () => {
      if (blocked.current) return null;
      const result = await mailSaveDraft(id, accountId, version.current, current.current);
      if (!result.ok) { blocked.current = true; setStopped(true); if (alive.current) { setError(result.error); setNotice("Draft not saved"); } return null; }
      version.current = result.data.row_version;
      stored.current = true;
      if (alive.current) setNotice("Draft saved");
      return result.data;
    }).catch(() => { blocked.current = true; setStopped(true); if (alive.current) setError("The draft could not be saved. Keep this window open and copy your message before reloading."); return null; });
    return queue.current;
  }
  useEffect(() => {
    if (pristine()) return;
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
    if (busy || closing.current) return;
    if (blocked.current || pristine()) { onClose(); return; }
    closing.current = true; setBusy(true); locked.current = true;
    const result = await save();
    if (result) onClose();
    else { closing.current = false; setBusy(false); locked.current = false; }
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
      setHolding(true);
      const released = await new Promise<boolean>((resolve) => {
        cancelHold.current = holdSend(() => resolve(alive.current));
        const undo = () => { if (cancelHold.current?.()) { setHolding(false); resolve(false); setNotice("Send cancelled. Draft saved"); body.current?.focus(); } };
        undoHold.current = undo;
        onHold?.(undo);
      });
      setHolding(false); undoHold.current = null;
      if (!released) return;
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
    await queue.current;
    if (!stored.current) { onClose(); return; }
    const row = await save();
    if (row) { const result = await mailDeleteDraft(id, row.row_version); if (result.ok) { onClose(); return; } setError(result.error); }
    setBusy(false); locked.current = false;
  }
  const readOnly = busy || stopped;
  return <form className="dock open mg-mail-compose" aria-labelledby={label} onSubmit={send} onKeyDown={(e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.requestSubmit(); }
    // Escape saves and closes from any field. Handling it here also stops a modal from closing twice.
    else if (e.key === "Escape" && !holding) { e.preventDefault(); e.stopPropagation(); void close(); }
  }}>
    <header className="dock-top"><h2 className="sr" id={label}>{data.title}</h2>{modes ? <div className="seg" role="group" aria-label="Reply type">{(["reply","replyAll","forward"] as const).map((kind) => <button type="button" key={kind} disabled={readOnly} aria-pressed={data.title === modes[kind]?.title} onClick={() => {const next=modes[kind];if(next) change({...next,body:current.current.body,uploadIds:current.current.uploadIds});}}>{kind === "replyAll" ? "Reply all" : kind === "forward" ? "Forward" : "Reply"}</button>)}</div> : <b>{data.title}</b>}<span className="dock-from">From <b className="mono">{from}</b></span><button type="button" className="btn ghost icon" disabled={busy} onClick={() => void close()} aria-label="Save and close"><MailIcon name="x" size="sm" /></button></header>
    {draft.saved && draft.saved.send_state !== "draft" && <p className="alert" role="alert">Sending was already started. Check Sent before creating another email. This copy cannot be sent again.</p>}
    <label className="dock-to">To<input name="to" aria-label="To" value={data.to} required disabled={readOnly} autoComplete="off" onChange={(e) => change({to:e.target.value})}/></label>
    <details className="compose-addresses" open={!modes || data.title === "Forward" || data.title === "Reply all"}><summary>Recipients and subject</summary><label>Copy<input name="cc" value={data.cc} disabled={readOnly} autoComplete="off" onChange={(e) => change({cc:e.target.value})}/></label><label>Subject<input name="subject" maxLength={300} value={data.subject} disabled={readOnly} onChange={(e) => change({subject:e.target.value})}/></label></details>
    <label className="sr" htmlFor={`${label}-body`}>Message</label><textarea id={`${label}-body`} ref={body} name="body" aria-label="Message" placeholder="Write your reply" rows={4} maxLength={500000} value={data.body} disabled={readOnly} onChange={(e) => change({body:e.target.value})} autoFocus/>
    {data.quoted && <p className="compose-quote-note">The earlier message is included below yours.{data.title === "Forward" ? " Attach any files you want to forward." : ""}</p>}
    {!!templates.length && <div className="qr-row"><span>Quick replies</span>{templates.map((t)=><button type="button" className="qr" key={t.id} disabled={readOnly} onClick={()=>insert(t.body)}>{t.name}</button>)}</div>}
    {!!data.uploadIds.length && <ul className="compose-files" aria-label="Attached files">{data.uploadIds.map((uploadId)=>{const f=files.find((x)=>x.id===uploadId);return <li key={uploadId}>{f?.file_name??"Attachment"} ({f?fileSize(f.size_bytes):"unavailable"}) <button type="button" disabled={readOnly} onClick={()=>change({uploadIds:current.current.uploadIds.filter((x)=>x!==uploadId)})}>Remove</button></li>;})}</ul>}
    {error && <p className="alert" role="alert">{error}</p>}
    <footer className="dock-foot"><label className="btn ghost icon" title="Attach a file"><MailIcon name="clip"/><span className="sr">Attach files</span><input className="sr" type="file" multiple disabled={readOnly} onChange={(e)=>{const picked=Array.from(e.target.files??[]);e.target.value="";void attach(picked);}}/></label><span className="meter">Files up to 4 MB each</span><small className="saved" role="status">{notice}</small>{holding ? <button type="button" className="btn line sm" onClick={()=>undoHold.current?.()}>Undo send</button> : <button type="button" className="btn ghost sm" onClick={()=>void discard()} disabled={readOnly}>Discard</button>}<button type="submit" className="btn gold sm" disabled={readOnly}>{holding ? "Sending in 5 seconds" : busy ? "Please wait" : "Send"}<kbd>Ctrl Enter</kbd></button></footer>
  </form>;
}
