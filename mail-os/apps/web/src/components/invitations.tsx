"use client";

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
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; email: string; token: string; link: string | null } | null>(null);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);

  const invitations = useQuery({ queryKey: ["admin-invitations"], queryFn: api.adminListInvitations, refetchInterval: 60_000 });
  const refresh = async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
  ]); };
  const create = useMutation({
    mutationFn: () => api.adminCreateInvitation({ email: email.trim(), role }),
    onSuccess: async (response) => {
      const link = /^https?:$/.test(window.location.protocol) ? window.location.origin + "/register?invite=" + encodeURIComponent(response.token) : null;
      setIssued({ id: response.invitation.id, email: response.invitation.email, token: response.token, link });
      setEmail(""); setError(null); setCopied(""); await refresh();
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Could not create the invitation."),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.adminRevokeInvitation(id),
    onSuccess: async (_, id) => { if (issued?.id === id) setIssued(null); await refresh(); },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Could not revoke the invitation."),
  });
  async function copy(kind: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); setError(null); }
    catch { setError("Clipboard access was denied. Select and copy the code or link below."); }
  }

  return <section className={s.section} aria-label="Invitations">
    <div><h2>Invitations</h2><p className={s.note}>Every member can read every synced mailbox. An invitation grants access to company mail.</p></div>
    <Panel><form className={s.form} onSubmit={(event) => { event.preventDefault(); setError(null); create.mutate(); }}>
      <Field label="Email address" htmlFor="invite-email"><Input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@kwetuconnectads.co.ke" /></Field>
      <Field label="Role" htmlFor="invite-role"><select id="invite-role" className="glass-input" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="Member">Member</option><option value="Admin">Admin</option></select></Field>
      <Button type="submit" disabled={create.isPending || !email.trim()}>{create.isPending ? "Creating..." : "Create invite"}</Button>
    </form><Feedback error={error} />
    {issued && <div className={s.issued}><h3>Invitation for {issued.email}</h3><p className={s.note}>Copy now. The server stores only a hash, so this code cannot be recovered later.</p>
      <div className={s.copyRow}><code>{issued.token}</code><Button variant="default" onClick={() => void copy("code", issued.token)}>{copied === "code" ? "Copied" : "Copy code"}</Button></div>
      {issued.link && <div className={s.copyRow}><code>{issued.link}</code><Button variant="default" onClick={() => void copy("link", issued.link!)}>{copied === "link" ? "Copied" : "Copy link"}</Button></div>}
      <Button variant="ghost" onClick={() => setIssued(null)}>Done</Button>
    </div>}</Panel>
    {invitations.isPending ? <SettingsState loading /> : invitations.isError ? <SettingsState error={invitations.error} retry={() => void invitations.refetch()} /> : !invitations.data.length ? <SettingsState empty="No invitations yet" /> : <div className={s.tickets}>{invitations.data.map((invitation) => {
      const pending = invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now;
      return <article className={s.ticket} key={invitation.id}><div><small>Invitation / {invitation.role}</small><h3>{invitation.email}</h3><p title={dateTime(invitation.expiresAt)}>{invitationExpiry(invitation.expiresAt, invitation.status, now)}</p></div><div className={s.actions}><Chip hue={pending ? "var(--warn)" : "var(--muted)"}>{pending ? "Pending" : invitation.status === "pending" ? "Expired" : invitation.status}</Chip>{pending && issued?.id === invitation.id && issued.link && <Button variant="default" onClick={() => void copy("link", issued.link!)}>{copied === "link" ? "Copied" : "Copy link"}</Button>}{pending && <Button variant="danger" disabled={revoke.isPending} onClick={() => { setError(null); revoke.mutate(invitation.id); }}>Revoke</Button>}</div></article>;
    })}</div>}
  </section>;
}
