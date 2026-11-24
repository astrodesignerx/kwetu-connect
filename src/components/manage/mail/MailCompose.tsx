"use client";
import { useId, useRef, useState, useTransition } from "react";
import { PaperPlaneTilt, Paperclip, X } from "@phosphor-icons/react";
import { mailSend, type SendInput } from "@/app/manage/(staff)/mail/actions";
import { fileSize, splitAddresses, textToHtml } from "./mail-format";

export interface Draft {
  title: string;
  to: string;
  cc: string;
  subject: string;
  /** The earlier message, quoted under what is typed. */
  quoted?: string;
  inReplyTo?: string | null;
  references?: string[];
  answers?: SendInput["answers"];
}

const LIMIT = 4 * 1024 * 1024;

/** Writing an email: a new one in a sheet, or a reply under the conversation. Ctrl+Enter sends. */
export default function MailCompose({ accountId, from, draft, onSent, onClose }: { accountId: string; from: string; draft: Draft; onSent: () => void; onClose: () => void }) {
  const id = useId();
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);

  function send(data: FormData) {
    setError(null);
    const body = String(data.get("body") ?? "");
    if (!body.trim() && !draft.quoted) { setError("Write a message first."); return; }
    if (total > LIMIT) { setError("Attachments can be up to 4 MB in total."); return; }
    start(async () => {
      const attachments = await Promise.all(files.map(async (f) => ({ filename: f.name, contentType: f.type || "application/octet-stream", contentBase64: await base64(f) })));
      const result = await mailSend({
        accountId, to: splitAddresses(String(data.get("to") ?? "")), cc: splitAddresses(String(data.get("cc") ?? "")),
        subject: String(data.get("subject") ?? ""), html: textToHtml(body) + (draft.quoted ?? ""),
        inReplyTo: draft.inReplyTo, references: draft.references, attachments, answers: draft.answers,
      });
      if (result.ok) onSent(); else setError(result.error);
    });
  }

  return <form ref={form} action={send} className="mg-mail-compose" aria-labelledby={`${id}-title`} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.current?.requestSubmit(); } }}>
    <div className="mg-mail-compose-head">
      <h3 id={`${id}-title`}>{draft.title}</h3>
      <button type="button" className="mg-icon-button" onClick={onClose} aria-label="Discard this email"><X size={15} aria-hidden="true" /></button>
    </div>
    <p className="mg-mail-muted">From {from}</p>
    <label className="mg-mail-field"><span>To</span><input name="to" defaultValue={draft.to} required autoFocus={!draft.to} placeholder="name@example.com" autoComplete="off" /></label>
    {showCc ? <label className="mg-mail-field"><span>Copy</span><input name="cc" defaultValue={draft.cc} placeholder="Separate addresses with commas" autoComplete="off" /></label>
      : <button type="button" className="mg-mail-link" onClick={() => setShowCc(true)}>Add a copy</button>}
    <label className="mg-mail-field"><span>Subject</span><input name="subject" defaultValue={draft.subject} maxLength={300} /></label>
    <label className="mg-mail-field mg-mail-body"><span className="sr-only">Message</span><textarea name="body" rows={draft.quoted ? 6 : 10} autoFocus={!!draft.to} placeholder="Write your message" /></label>
    {draft.quoted && <p className="mg-mail-muted">The earlier message is included below yours.</p>}
    {files.length > 0 && <ul className="mg-mail-files" aria-label="Attached files">
      {files.map((f, i) => <li key={`${f.name}-${i}`}><span className="mg-pill"><Paperclip size={13} aria-hidden="true" /><span>{f.name}</span><small>{fileSize(f.size)}</small>
        <button type="button" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X size={12} aria-hidden="true" /></button></span></li>)}
    </ul>}
    {error && <p role="alert" className="mg-mail-error">{error}</p>}
    <div className="mg-mail-form-actions">
      <button type="submit" className="mg-primary" disabled={pending} aria-busy={pending}><PaperPlaneTilt size={14} aria-hidden="true" />{pending ? "Sending" : "Send"}</button>
      <label className="mg-pill mg-mail-attach"><Paperclip size={14} aria-hidden="true" />Attach<input type="file" multiple className="sr-only" onChange={(e) => { const picked = Array.from(e.target.files ?? []); setFiles((list) => [...list, ...picked].slice(0, 10)); e.target.value = ""; }} /></label>
      <small className="mg-mail-muted" data-over={total > LIMIT || undefined}>{files.length ? `${fileSize(total)} of 4 MB` : "Ctrl Enter sends"}</small>
    </div>
  </form>;
}

function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}
