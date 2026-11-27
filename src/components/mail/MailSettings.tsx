"use client";
import { useEffect, useState, type ReactNode } from "react";
import { disconnectMailbox, mailSharing, mailAddMember, mailRemoveMember, mailRename } from "@/app/mail/actions";
import type { AccountView } from "@/lib/mail/accounts";
import ConnectMailbox from "./ConnectMailbox";
import MailIcon, { type MailIconName } from "./MailIcon";
import { useConfirm } from "./MailOverlay";
import { MailThemeCards } from "./MailTheme";
import { checkedAgo, signatureHtml } from "./mail-format";
import { mailRequest } from "./mail-request";
import { mailReadSignature, mailSaveSignature } from "@/app/mail/kca-actions";
import { SHORTCUTS } from "./shortcuts";

type Section = "mailboxes" | "signature" | "team" | "appearance" | "shortcuts";
const SECTIONS: [Section, string, MailIconName][] = [
  ["mailboxes", "Mailboxes", "unread"],
  ["signature", "Signature", "compose"],
  ["team", "Team access", "clients"],
  ["appearance", "Appearance", "sun"],
  ["shortcuts", "Shortcuts", "key"],
];

/** One signature per mailbox. Everyone who answers the address sends it, and can switch it off per email. */
function SignatureEditor({ accountId, accountEmail, onSaved }: { accountId: string; accountEmail: string; onSaved?: (signature: string) => void }) {
  const [value, setValue] = useState<string | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void mailRequest(mailReadSignature(accountId)).then((r) => {
      if (!live) return;
      if (r.ok) setValue(r.data); else { setValue(""); setMessage(r.error); }
    });
    return () => { live = false; };
  }, [accountId]);
  if (value === null) return <p className="muted">Loading signature...</p>;
  return <form className="sig-split" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await mailRequest(mailSaveSignature(accountId, value)); setBusy(false); if (r.ok) { setValue(r.data); setMessage("Signature saved"); onSaved?.(r.data); } else setMessage(r.error); }}>
    <div>
      <label className="field"><span>Signature for {accountEmail}</span><textarea rows={6} maxLength={2000} value={value} placeholder={"Warm regards,\nKwetu Connect Advertising\n+254 700 000 000"} onChange={(e) => setValue(e.target.value)} /><small className="muted">Added under new emails and replies from this address. **Bold**, *italic* and links work here too.</small></label>
      <div className="btn-row"><button className="btn gold" disabled={busy}><MailIcon name="check" size="xs" />Save signature</button>{message && <span className="tpl-status" role="status">{message}</span>}</div>
    </div>
    <div>
      <div className="sec-h" style={{ marginTop: 0 }}><MailIcon name="eye" size="sm" />Preview</div>
      <div className="card sig-preview-box">
        {value.trim() ? <div className="signature-preview-html" dangerouslySetInnerHTML={{ __html: signatureHtml(value) }} /> : <p className="muted">No signature set yet.</p>}
        <div className="sig-brandline"><MailIcon name="screen" size="xs" />kwetuconnectads.co.ke</div>
      </div>
    </div>
  </form>;
}

function MailboxSharingPanel({ account: a, onRemoved }: { account: AccountView; onRemoved: () => void }) {
  const [sharing, setSharing] = useState<Extract<Awaited<ReturnType<typeof mailSharing>>, { ok: true }>["data"] | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void mailRequest(mailSharing(a.id)).then((r) => { if (live) { if (r.ok) setSharing(r.data); else setError(r.error); } });
    return () => { live = false; };
  }, [a.id, tick]);
  const owned = !!sharing && sharing.me.toLowerCase() === sharing.owner;
  const ownerName = sharing?.people.find((p) => p.email === sharing.owner)?.name ?? a.owner_email ?? "the owner";
  const action = async (fn: Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, remove = false) => {
    setBusy(true); setError("");
    const r = await mailRequest(fn);
    setBusy(false);
    if (r.ok) { if (remove) onRemoved(); else setTick((n) => n + 1); } else setError(r.error);
  };
  return <article className="card team-card">
    <div className="team-card-head">
      <span className="av" data-tone="amber"><MailIcon name="unread" size="xs" /></span>
      <div><b>{a.label || a.email}</b>{a.label && a.label.trim().toLowerCase() !== a.email.trim().toLowerCase() && <span className="mono">{a.email}</span>}</div>
    </div>
    <div className="mailbox-sharing">
      {!sharing ? <p className="muted">Loading team access...</p> : owned ? <>
        {sharing.people.filter((p) => p.email !== sharing.owner).map((p) => (
          <div className="member-row" key={p.email}>
            <span><b>{p.name}</b><small>{p.email}</small></span>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void action(mailRemoveMember(a.id, p.email))}>Remove</button>
          </div>
        ))}
        {sharing.people.length === 1 && <p className="muted">Only you have access to this mailbox.</p>}
        <form className="member-add" onSubmit={(e) => { e.preventDefault(); const email = String(new FormData(e.currentTarget).get("email") ?? ""); if (email) void action(mailAddMember(a.id, email)); }}>
          <label className="sr" htmlFor={`member-${a.id}`}>Add staff member</label>
          <select id={`member-${a.id}`} name="email" aria-label={`Share ${a.email} with`} required defaultValue="">
            <option value="">Choose a colleague</option>
            {sharing.staff.filter((p) => !sharing.people.some((m) => m.email === p.email)).map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
          </select>
          <button className="btn line sm" disabled={busy}>Share</button>
        </form>
      </> : <div className="member-row">
        <span>Shared by {ownerName}</span>
        <button type="button" className="btn line sm" disabled={busy} onClick={() => void action(mailRemoveMember(a.id, sharing.me), true)}>Leave</button>
      </div>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  </article>;
}

/** True when this staff member owns the mailbox: only the owner may rename, reconnect, remove it or set its signature. */
const ownedBy = (a: AccountView, me: string) => !a.owner_email || !me || a.owner_email.toLowerCase() === me.toLowerCase();

function MailboxRow({ account: a, owned, onReconnect, onRemoved, onChanged }: { account: AccountView; owned: boolean; onReconnect: () => void; onRemoved: () => void; onChanged: (patch: Partial<AccountView>) => void }) {
  const [renaming, setRenaming] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [confirmDialog, ask] = useConfirm();
  const remove = async () => {
    if (!await ask({ title: `Remove ${a.email}?`, text: "Everyone it is shared with loses access here. Mail on the mail server is not touched.", action: "Remove mailbox", icon: "inbox" })) return;
    setBusy(true); setError("");
    const r = await mailRequest(disconnectMailbox(a.id));
    setBusy(false);
    if (r.ok) onRemoved(); else setError(r.error);
  };
  return <div className={`mbox-row ${a.last_error ? "err" : ""}`}>
    <div className="mbox-top">
      <span className="av" data-tone="amber"><MailIcon name="unread" size="xs" /></span>
      <div className="mbox-main">
        <b>{a.label || a.email}<i className={`dot ${a.last_error ? "warn" : ""}`} /></b>
        {a.label && a.label.trim().toLowerCase() !== a.email.trim().toLowerCase() && <span className="mono">{a.email}</span>}
        <span>{a.last_error || checkedAgo(a.last_synced_at)}</span>
      </div>
      {!owned ? <div className="mbox-acts"><small className="muted">Shared by {a.owner_email}. Leave it under Team access.</small></div> : <div className="mbox-acts">
        {a.last_error ? (
          <button type="button" className="btn gold sm" onClick={onReconnect}>Reconnect</button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={onReconnect}><MailIcon name="refresh" size="xs" />Server settings</button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => setRenaming((v) => !v)}>Rename</button>
        <button type="button" className="btn ghost sm bad-btn" disabled={busy} onClick={() => void remove()}>Remove</button>
      </div>}
    </div>
    {renaming && <form className="member-add mbox-rename" onSubmit={async (e) => {
      e.preventDefault();
      const label = String(new FormData(e.currentTarget).get("label"));
      setBusy(true); setError("");
      const r = await mailRequest(mailRename(a.id, label));
      setBusy(false);
      if (r.ok) { onChanged({ label }); setRenaming(false); } else setError(r.error);
    }}>
      <label>Mailbox label<input name="label" defaultValue={a.label} required maxLength={60} /></label>
      <button className="btn gold sm" disabled={busy}>Save</button>
      <button type="button" className="btn ghost sm" onClick={() => setRenaming(false)}>Cancel</button>
    </form>}
    {error && <p className="alert" role="alert">{error}</p>}
    {confirmDialog}
  </div>;
}

export default function MailSettings({ accounts, demo, me = "", onAccounts, onSignature, headerStart, onSearchPalette }: {
  accounts: AccountView[]; me?: string; demo: boolean; onAccounts?: (accounts: AccountView[]) => void; onSignature?: (accountId: string, signature: string) => void;
  headerStart?: ReactNode; onSearchPalette?: () => void;
}) {
  const [section, setSection] = useState<Section>("mailboxes");
  const [reconnect, setReconnect] = useState<AccountView | undefined>();
  const [adding, setAdding] = useState(accounts.length === 0);
  const mine = accounts.filter((a) => ownedBy(a, me));
  const [sigAccountId, setSigAccountId] = useState(mine[0]?.id ?? "");
  const activeSigAccount = mine.find((a) => a.id === sigAccountId) ?? mine[0];

  return <section className="panel main mail-settings-panel split-view">
    <header className="view-head">
      {headerStart}
      <h1>Settings</h1>
      <span className="vh-sp" />
      {onSearchPalette && <button type="button" className="vsearch" onClick={onSearchPalette} aria-label="Search mail, clients and bookings"><MailIcon name="search" size="xs" /><span>Search mail, clients, bookings</span><kbd>/</kbd></button>}
    </header>
    <div className="set-shell">
      <nav className="set-nav" aria-label="Settings sections">
        {SECTIONS.map(([key, label, icon]) => (
          <button key={key} type="button" aria-current={section === key ? "true" : undefined} onClick={() => setSection(key)}>
            <MailIcon name={icon} size="sm" /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="set-body"><div className="set-in">
        {section === "mailboxes" && <>
          <h2>Mailboxes</h2>
          <p className="set-lede">Mail is read live from each mailbox&apos;s own server every 5 minutes in the background and every 2 minutes while this page is open.</p>
          {accounts.length > 0 && <div className="card mbox-list">
            {accounts.map((a) => (
              <MailboxRow key={a.id} account={a} owned={ownedBy(a, me)}
                onReconnect={() => { setReconnect(a); setAdding(true); }}
                onChanged={(patch) => onAccounts?.(accounts.map((row) => row.id === a.id ? { ...row, ...patch } : row))}
                onRemoved={() => onAccounts?.(accounts.filter((row) => row.id !== a.id))} />
            ))}
          </div>}
          {(adding || reconnect) ? (
            <div className="set-connect">
              <ConnectMailbox key={reconnect?.id ?? "connect"} demo={demo} first={!accounts.length} account={reconnect}
                onCancel={accounts.length ? () => { setAdding(false); setReconnect(undefined); } : undefined}
                onConnected={(account) => { onAccounts?.([...accounts.filter((a) => a.id !== account.id), account]); setAdding(false); setReconnect(undefined); }} />
            </div>
          ) : (
            <button type="button" className="btn line" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
              <MailIcon name="plus" size="xs" />Add a mailbox
            </button>
          )}
          <p className="fine" style={{ marginTop: 18 }}><MailIcon name="lock" size="sm" /><span>Passwords are encrypted before storage. Colleagues can answer a shared address without seeing its password.</span></p>
        </>}

        {section === "signature" && <>
          <h2>Signature</h2>
          <p className="set-lede">Added under every new email and reply from each mailbox.</p>
          {mine.length > 1 && <div className="client-seg" role="group" aria-label="Choose mailbox" style={{ marginBottom: 16 }}>
            {mine.map((a) => (
              <button key={a.id} type="button" aria-pressed={activeSigAccount?.id === a.id} onClick={() => setSigAccountId(a.id)}>
                {a.label !== a.email ? a.label : a.email}
              </button>
            ))}
          </div>}
          {activeSigAccount ? (
            <SignatureEditor key={activeSigAccount.id} accountId={activeSigAccount.id} accountEmail={activeSigAccount.email} onSaved={(text) => onSignature?.(activeSigAccount.id, text)} />
          ) : <p className="muted">{accounts.length ? "Only a mailbox's owner can set its signature. Ask them to change it." : "Connect a mailbox first to set its signature."}</p>}
        </>}

        {section === "team" && <>
          <h2>Team access</h2>
          <p className="set-lede">Choose who on the Kwetu Connect team can read and reply from each shared mailbox.</p>
          <div className="team-stack">
            {accounts.length ? accounts.map((a) => (
              <MailboxSharingPanel key={a.id} account={a} onRemoved={() => onAccounts?.(accounts.filter((row) => row.id !== a.id))} />
            )) : <p className="muted">Connect a mailbox first to share it with colleagues.</p>}
          </div>
        </>}

        {section === "appearance" && <>
          <h2>Appearance</h2>
          <p className="set-lede">Applies to Booking Desk on this device.</p>
          <MailThemeCards />
        </>}

        {section === "shortcuts" && <>
          <h2>Keyboard shortcuts</h2>
          <p className="set-lede">Work through the inbox without reaching for the mouse. Letter shortcuts pause while typing.</p>
          <div className="card keys-card"><div className="keys-grid">
            {SHORTCUTS.map(([keys, desc]) => (
              <div className="key-row" key={keys}><span>{desc}</span><kbd>{keys}</kbd></div>
            ))}
          </div></div>
        </>}
      </div></div>
    </div>
  </section>;
}
