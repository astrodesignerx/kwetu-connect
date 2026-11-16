"use client";

import { MailCheck, MailWarning } from "lucide-react";
import { CheckRow } from "@/components/settings/check-row";
import grid from "@/components/settings/check-row.module.css";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@kompanion/types";
import { api } from "@/lib/api";
import { invitationExpiry } from "@/lib/signal-settings";
import { Button, Chip, Input } from "@/components/ui";
import { Feedback, Field, Panel, SettingsState, dateTime } from "@/components/settings/settings";
import s from "@/components/settings/invitations.module.css";

export function InvitationsPanel() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Member");
  const [mailboxIds, setMailboxIds] = useState<string[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; email: string; token: string; link: string | null; emailSent: boolean; emailRequested: boolean } | null>(null);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);

  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: api.listMailboxes });
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.mailOverview });
  const connected = mailboxes.data?.filter((mailbox) => mailbox.isActive) ?? [];
  const sendFromMailboxId = sendingId ?? connected.find((mailbox) => overview.data?.mailboxes.some((status) => status.id === mailbox.id && status.syncState === "Syncing"))?.id ?? "";
  const addresses = new Map(mailboxes.data?.map((mailbox) => [mailbox.id, mailbox.email]));
  const invitations = useQuery({ queryKey: ["admin-invitations"], queryFn: api.adminListInvitations, refetchInterval: 60_000 });
  const refresh = async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
  ]); };
  const create = useMutation({
    mutationFn: () => api.adminCreateInvitation({ email: email.trim(), role, mailboxIds: role === "Admin" ? [] : mailboxIds, sendFromMailboxId: sendFromMailboxId || undefined }),
    onSuccess: async (response) => {
      const link = /^https?:$/.test(window.location.protocol) ? window.location.origin + "/register?invite=" + encodeURIComponent(response.token) : null;
      setIssued({ id: response.invitation.id, email: response.invitation.email, token: response.token, link, emailSent: response.emailSent, emailRequested: !!sendFromMailboxId });
      setEmail(""); setMailboxIds([]); setError(null); setCopied(""); await refresh();
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Could not create the invitation"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.adminRevokeInvitation(id),
    onSuccess: async (_, id) => { if (issued?.id === id) setIssued(null); await refresh(); },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Could not revoke the invitation"),
  });
  async function copy(kind: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); setError(null); }
    catch { setError("Clipboard access was denied. Select and copy the code or link below."); }
  }

  return <section className={s.section} aria-label="Invitations">
    <div><h2>Invitations</h2><p className={s.note}>An invitation gives access to the mailboxes you choose.</p></div>
    <Panel><form className={s.form} onSubmit={(event) => { event.preventDefault(); setError(null); create.mutate(); }}>
      <div className={s.firstRow}>
        <Field label="Email address" htmlFor="invite-email"><Input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@kwetuconnectads.co.ke" /></Field>
        <Field label="Role" htmlFor="invite-role"><select id="invite-role" className="glass-input" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="Member">Member</option><option value="Admin">Admin</option></select></Field>
      </div>
      <fieldset className={s.block}><legend>Mailboxes they will see</legend>
        {role === "Admin" ? <p className={s.note}>Admins see every mailbox.</p> : <>
          {mailboxes.isPending ? <SettingsState loading /> : mailboxes.isError ? <SettingsState error={mailboxes.error} retry={() => void mailboxes.refetch()} /> : <div className={grid.grid}>{connected.map((mailbox) => <CheckRow key={mailbox.id} label={mailbox.email} checked={mailboxIds.includes(mailbox.id)} onChange={(checked) => setMailboxIds(checked ? [...mailboxIds, mailbox.id] : mailboxIds.filter((id) => id !== mailbox.id))} />)}</div>}
          {!mailboxIds.length && <p className={s.note}>They will see no mail until you share a mailbox with them.</p>}
        </>}
      </fieldset>
      <div className={s.sender}><Field label="Send the invitation from" htmlFor="invite-sender" hint="The email is sent from this address and a copy is kept in its Sent folder.">
        <select id="invite-sender" className="glass-input" value={sendFromMailboxId} onChange={(event) => setSendingId(event.target.value)}>
          <option value="">Do not email, I will copy the link</option>{connected.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email}</option>)}
        </select>
      </Field></div>
      <Button type="submit" disabled={create.isPending || !email.trim()}>{create.isPending ? "Creating" : sendFromMailboxId ? "Send invitation" : "Create invitation"}</Button>
    </form><Feedback error={error} />
    {issued && <div className={s.issued}>{issued.emailRequested ? <p className={s.emailStatus} data-sent={issued.emailSent} role="status">{issued.emailSent ? <MailCheck size={16} aria-hidden="true" /> : <MailWarning size={16} aria-hidden="true" />}{issued.emailSent ? `Invitation emailed to ${issued.email}` : "The email could not be sent. Copy the link below."}</p> : <p className={s.note} role="status">No email was sent. Copy the link below and pass it on.</p>}<h3>Invitation for {issued.email}</h3><p className={s.note}>Copy now. The server stores only a hash, so this code cannot be recovered later.</p>
      {issued.link && <div className={s.copyRow}><code>{issued.link}</code><Button variant="default" onClick={() => void copy("link", issued.link!)}>{copied === "link" ? "Copied" : "Copy link"}</Button></div>}
      <div className={s.copyRow}><code>{issued.token}</code><Button variant="default" onClick={() => void copy("code", issued.token)}>{copied === "code" ? "Copied" : "Copy code"}</Button></div>
      <Button variant="ghost" onClick={() => setIssued(null)}>Done</Button>
    </div>}</Panel>
    {invitations.isPending ? <SettingsState loading /> : invitations.isError ? <SettingsState error={invitations.error} retry={() => void invitations.refetch()} /> : !invitations.data.length ? <SettingsState empty="No invitations yet" /> : <div className={s.tickets}>{invitations.data.map((invitation) => {
      const pending = invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now;
      return <article className={s.ticket} key={invitation.id}><div><small>{invitation.role} invitation</small><h3>{invitation.email}</h3><p title={dateTime(invitation.expiresAt)}>{invitationExpiry(invitation.expiresAt, invitation.status, now)}</p><p>{invitation.role === "Admin" ? "Admin, sees every mailbox" : invitation.mailboxIds.length ? `Will see ${invitation.mailboxIds.map((id) => addresses.get(id) ?? "Disconnected mailbox").join(", ")}` : "Will see no mailbox yet"}</p></div><div className={s.actions}><Chip strong={pending}>{pending ? "Pending" : invitation.status === "pending" ? "Expired" : invitation.status}</Chip>{pending && issued?.id === invitation.id && issued.link && <Button variant="default" onClick={() => void copy("link", issued.link!)}>{copied === "link" ? "Copied" : "Copy link"}</Button>}{pending && <Button variant="danger" disabled={revoke.isPending} onClick={() => { setError(null); revoke.mutate(invitation.id); }}>Revoke</Button>}</div></article>;
    })}</div>}
  </section>;
}
