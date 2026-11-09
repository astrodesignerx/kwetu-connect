"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { connectChecklist, type ConnectStage } from "@/lib/signal-settings";
import { Button, Input } from "@/components/ui";
import { Feedback, Field, Panel, SettingsHeader } from "@/components/settings/settings";
import s from "./page.module.css";

export default function ConnectMailboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [stage, setStage] = useState<ConnectStage>("idle");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage === "connecting" || stage === "verifying";
  const locked = busy || connectionId !== null;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  }
  async function verify(id: string) {
    setStage("verifying"); setError(null);
    try {
      await api.reverifyMailbox(id);
      setStage("verified");
      await refresh();
      router.replace("/mail");
    } catch (failure) {
      setStage("verify-error");
      setError(failure instanceof Error ? failure.message : "Saved connection could not be verified");
      await refresh();
    }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setStage("connecting"); setError(null);
    try {
      const mailbox = await api.connectMailbox({ email, password, imapHost: imapHost || undefined, smtpHost: smtpHost || undefined });
      setConnectionId(mailbox.id); setPassword(""); setStage("connected");
      await refresh();
      await verify(mailbox.id);
    } catch (failure) {
      setPassword(""); setStage("connect-error");
      setError(failure instanceof Error ? failure.message : "Could not connect this mailbox");
    }
  }

  return <div className={s.page}>
    <SettingsHeader title="Connect your email" context="Settings / Mailboxes" description="Sign in with the email and password you use for webmail" action={<Link href="/settings/mailboxes" className={s.cancel}>{connectionId ? "Back to mailboxes" : "Cancel"}</Link>} />
    <Panel><form onSubmit={(event) => void connect(event)} className={s.form}>
      <div className={s.fields}>
        <Field label="Email address" htmlFor="mb-email"><Input id="mb-email" type="email" autoFocus autoComplete="username" required disabled={locked} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <Field label="Password" htmlFor="mb-password" hint="Stored encrypted by your workspace"><Input id="mb-password" type="password" autoComplete="new-password" required disabled={locked} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      </div>
      <Feedback error={error} message={stage === "verified" ? "Connected. Opening your inbox." : stage === "verify-error" ? "The mailbox is connected. The additional test needs attention." : null} />
      {connectionId ? <div className={s.actions}>{stage === "verify-error" && <Button type="button" disabled={busy} onClick={() => void verify(connectionId)}>Retry saved connection test</Button>}<Link href="/settings/mailboxes">View mailbox health</Link></div> : <Button type="submit" disabled={busy}>{busy ? "Connecting..." : "Connect"}</Button>}
      {stage !== "idle" && <ol className={s.checklist} aria-live="polite">{connectChecklist(stage).map((step, index) => <li key={step.label} data-state={step.state}><span aria-hidden="true">{step.state === "complete" ? "✓" : step.state === "error" ? "!" : index + 1}</span><div><b>{step.label}</b><small>{step.detail}</small></div></li>)}</ol>}
      <details className={s.advanced}><summary>My provider needs specific servers</summary><div className={s.fields}><Field label="Receiving server (IMAP)" htmlFor="imapHost" hint="Port 993, TLS"><Input id="imapHost" disabled={locked} value={imapHost} onChange={(event) => setImapHost(event.target.value)} placeholder="mail.example.com" /></Field><Field label="Sending server (SMTP)" htmlFor="smtpHost" hint="Port 465, TLS. Use the hostname on its certificate."><Input id="smtpHost" disabled={locked} value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} placeholder="Your provider's SMTP hostname" /></Field></div></details>
      <p className={s.note}>No test email is sent. Your existing mail syncs in the background.</p>
    </form></Panel>
  </div>;
}
