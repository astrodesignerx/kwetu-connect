"use client";
import { useId, useState, useTransition } from "react";
import { Eye, EyeSlash, LockSimple } from "@phosphor-icons/react";
import { connectMailbox } from "@/app/manage/(staff)/mail/actions";
import type { AccountView } from "@/lib/mail/accounts";

/** First-day card: connect your own mailbox with the address and password you use for webmail. */
export default function ConnectMailbox({ onConnected, onCancel, first, demo = false }: { onConnected: (account: AccountView) => void; onCancel?: () => void; first: boolean; demo?: boolean }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(form: FormData) {
    setError(null);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    start(async () => {
      const result = await connectMailbox({
        email: value("email"), password: String(form.get("password") ?? ""),
        imapHost: value("imapHost") || undefined, imapPort: Number(value("imapPort")) || undefined,
        smtpHost: value("smtpHost") || undefined, smtpPort: Number(value("smtpPort")) || undefined,
        username: value("username") || undefined,
      });
      if (result.ok) onConnected(result.data); else setError(result.error);
    });
  }
  return <section className="mg-panel mg-mail-connect" aria-labelledby={`${id}-title`}>
    <span className="mg-eyebrow">{first ? "Set up mail" : "Another mailbox"}</span>
    <h2 id={`${id}-title`}>Connect your mailbox</h2>
    <p className="mg-mail-muted">{demo ? "Demo mode: press Connect to open a sample mailbox. No password is needed and nothing is sent." : "Use the address and password you sign in to webmail with. Your mail stays on the mail server: this page reads it from there."}</p>
    <form action={submit} className="mg-mail-form">
      <label htmlFor={`${id}-email`}>Email address</label>
      <input id={`${id}-email`} name="email" type="email" required={!demo} autoComplete="username" placeholder="you@kwetuconnectads.co.ke" maxLength={200} />
      <label htmlFor={`${id}-password`}>Password</label>
      <div className="mg-mail-password">
        <input id={`${id}-password`} name="password" type={show ? "text" : "password"} required={!demo} autoComplete="current-password" maxLength={500} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
      </div>
      <details className="mg-mail-servers">
        <summary>Server settings</summary>
        <p className="mg-mail-muted">Only needed when the servers cannot be found from the address. Copy them from the mail client settings in webmail.</p>
        <div className="mg-mail-server-grid">
          <label>Incoming (IMAP) server<input name="imapHost" placeholder="mail.example.com" maxLength={253} /></label>
          <label>Port<input name="imapPort" inputMode="numeric" placeholder="993" maxLength={5} /></label>
          <label>Outgoing (SMTP) server<input name="smtpHost" placeholder="mail.example.com" maxLength={253} /></label>
          <label>Port<input name="smtpPort" inputMode="numeric" placeholder="465" maxLength={5} /></label>
          <label className="mg-mail-wide">Username, if not the email address<input name="username" maxLength={200} autoComplete="off" /></label>
        </div>
      </details>
      {error && <p role="alert" className="mg-mail-error">{error}</p>}
      <div className="mg-mail-form-actions">
        <button type="submit" className="mg-primary" disabled={pending} aria-busy={pending}>{pending ? (demo ? "Opening" : "Checking the mailbox") : "Connect"}</button>
        {onCancel && <button type="button" className="mg-pill" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
    <p className="mg-mail-note"><LockSimple size={13} aria-hidden="true" />Only you see this mailbox. The password is stored encrypted.</p>
  </section>;
}
