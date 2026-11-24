"use client";
import Link from "next/link";
import { useState } from "react";
import { disconnectMailbox } from "@/app/mail/actions";
import type { AccountView } from "@/lib/mail/accounts";
import ConnectMailbox from "./ConnectMailbox";
import MailTheme from "./MailTheme";

export default function MailSettings({ accounts: initial, demo }: { accounts: AccountView[]; demo: boolean }) {
  const [accounts, setAccounts] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function disconnect(account: AccountView) {
    if (!confirm(`Disconnect ${account.email}? You can connect it again later.`)) return;
    setBusy(true);
    try { const r = await disconnectMailbox(account.id); if (r.ok) setAccounts((rows) => rows.filter((a) => a.id !== account.id)); else setError(r.error); }
    catch { setError("The mailbox could not be disconnected. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="mail-settings"><Link href="/mail">Back to Mail</Link><h1>Mail settings</h1><MailTheme />
    <ul>{accounts.map((a) => <li key={a.id}><span>{a.email}<small>{a.last_error ? ` | ${a.last_error}` : a.last_synced_at ? ` | Last checked ${new Date(a.last_synced_at).toLocaleString("en-GB")}` : " | Not checked yet"}</small></span><button type="button" disabled={busy} onClick={() => void disconnect(a)}>Disconnect</button></li>)}</ul>
    {error && <p role="alert">{error}</p>}
    <ConnectMailbox demo={demo} first={!accounts.length} onConnected={(account) => setAccounts((rows) => [...rows.filter((a) => a.id !== account.id), account])} />
  </section>;
}
