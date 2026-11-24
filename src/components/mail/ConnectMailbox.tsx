"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { Eye, EyeSlash, LockSimple } from "@phosphor-icons/react";
import { connectMailbox, mailDiscover, mailServerSettings } from "@/app/mail/actions";
import { mailRequest } from "./mail-request";
import MailIcon from "./MailIcon";
import type { AccountView } from "@/lib/mail/accounts";

/** First-day card: connect your own mailbox with the address and password you use for webmail. */
export default function ConnectMailbox({ onConnected, onCancel, first, demo = false, account }: { onConnected: (account: AccountView) => void; onCancel?: () => void; first: boolean; demo?: boolean; account?: AccountView }) {
  const id = useId();
  const [step, setStep] = useState(0);
  const [servers, setServers] = useState("");
  const [savedServers,setSavedServers] = useState<Extract<Awaited<ReturnType<typeof mailServerSettings>>,{ok:true}>["data"] | null>(null);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { let live=true; if(account) void mailRequest(mailServerSettings(account.id)).then((r) => {if(live){if(r.ok)setSavedServers(r.data);else setError(r.error);}});return()=>{live=false;}; },[account]);
  function submit(form: FormData) {
    setError(null); setStep(1);
    const value = (name: string) => String(form.get(name) ?? "").trim() || (name === "email" && demo ? "you@kwetuconnectads.co.ke" : "");
    start(async () => {
      if (!value("imapHost")) {
        const found = await mailRequest(mailDiscover(value("email")));
        if (!found.ok) { setError("Find the mail servers failed. " + found.error); return; }
        setServers([found.data.imap ? `IMAP ${found.data.imap[0]} : ${found.data.imap[1]}` : "IMAP candidates from this domain", found.data.smtp ? `SMTP ${found.data.smtp[0]} : ${found.data.smtp[1]}` : "SMTP checked after IMAP"].join(" / "));
      } else setServers("Using the server settings below");
      setStep(2);
      const result = await mailRequest(connectMailbox({
        accountId: account?.id,
        email: value("email"), password: String(form.get("password") ?? ""),
        imapHost: value("imapHost") || undefined, imapPort: Number(value("imapPort")) || undefined,
        smtpHost: value("smtpHost") || undefined, smtpPort: Number(value("smtpPort")) || undefined,
        username: value("username") || undefined,
      }));
      if (result.ok) { setStep(4); onConnected(result.data); } else { setStep(result.error.startsWith("SMTP") ? 3 : 2); setError(result.error); }
    });
  }
  return <section className="form-card mg-mail-connect" aria-labelledby={`${id}-title`}>
    <span className="mg-eyebrow">{first ? "Set up mail" : "Another mailbox"}</span>
    <h2 id={`${id}-title`}>{account ? "Reconnect mailbox" : "Connect your mailbox"}</h2>
    <p className="mg-mail-muted">{demo ? "Demo mode: press Connect to open a sample mailbox. No password is needed and nothing is sent." : "Use the address and password you sign in to webmail with. Your mail stays on the mail server: this page reads it from there."}</p>
    <form action={submit} className="mg-mail-form">
      <label htmlFor={`${id}-email`}>Email address</label>
      <input id={`${id}-email`} name="email" type="email" defaultValue={account?.email} readOnly={!!account} required={!demo} autoComplete="username" placeholder="you@kwetuconnectads.co.ke" maxLength={200} />
      <label htmlFor={`${id}-password`}>Password</label>
      <div className="mg-mail-password">
        <input id={`${id}-password`} name="password" type={show ? "text" : "password"} required={!demo} autoComplete="current-password" maxLength={500} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
      </div>
      <details className="mg-mail-servers" open={!!account}>
        <summary>Server settings</summary>
        <p className="mg-mail-muted">Only needed when the servers cannot be found from the address. Copy them from the mail client settings in webmail.</p>
        <div className="mg-mail-server-grid">
          <label>Incoming (IMAP) server<input name="imapHost" defaultValue={savedServers?.imap_host} placeholder="mail.example.com" maxLength={253} /></label>
          <label>Port<input name="imapPort" defaultValue={savedServers?.imap_port} inputMode="numeric" placeholder="993" maxLength={5} /></label>
          <label>Outgoing (SMTP) server<input name="smtpHost" defaultValue={savedServers?.smtp_host} placeholder="mail.example.com" maxLength={253} /></label>
          <label>Port<input name="smtpPort" defaultValue={savedServers?.smtp_port} inputMode="numeric" placeholder="465" maxLength={5} /></label>
          <label className="mg-mail-wide">Username, if not the email address<input name="username" defaultValue={savedServers?.username} maxLength={200} autoComplete="off" /></label>
        </div>
      </details>
      {servers && <div className="servers"><MailIcon name="server" size="sm" /><span>{servers}</span></div>}
      {!!step && <ol className="steps" aria-live="polite">{["Find the mail servers", "IMAP sign-in", "SMTP sign-in"].map((name, i) => <li key={name} className={`step ${step > i + 1 ? "done" : error && step === i + 1 ? "fail" : pending && step === i + 1 ? "run" : ""}`}><span className="st"><MailIcon name={step > i + 1 ? "check" : error && step === i + 1 ? "x" : "clock"} size="xs" /></span>{name}</li>)}</ol>}
      {error && <p role="alert" className="mg-mail-error">{error}</p>}
      <div className="mg-mail-form-actions">
        <button type="submit" className="mg-primary" disabled={pending} aria-busy={pending}>{pending ? (demo ? "Opening" : "Checking the mailbox") : "Connect"}</button>
        {onCancel && <button type="button" className="mg-pill" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
    <p className="mg-mail-note"><LockSimple size={13} aria-hidden="true" />Connect an address once, then share it with the colleagues who answer it. The password is stored encrypted.</p>
  </section>;
}
