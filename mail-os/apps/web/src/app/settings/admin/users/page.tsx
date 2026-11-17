"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { Button, Chip } from "@/components/ui";
import { InvitationsPanel } from "@/components/invitations";
import { ShellDialog } from "@/components/shell/dialog";
import { useToast } from "@/components/shell/toast";
import invite from "@/components/settings/invitations.module.css";
import { Avatar, Feedback, Panel, SettingsHeader, SettingsState, dateTime } from "@/components/settings/settings";
import s from "./page.module.css";

const permissions = [
  ["Read and reply from mailboxes", "Every mailbox", "Mailboxes shared with them or they connected"],
  ["Test or disconnect a mailbox", "Every mailbox", "Mailboxes they connected"],
  ["Choose who sees each mailbox", "Yes", "No"],
  ["Reset someone's password", "Yes", "No"],
  ["Assign threads, add notes, manage clients", "Yes", "Yes"],
  ["Edit templates and email appearance", "Yes", "Yes"],
  ["Invite people and change roles", "Yes", "No"],
  ["View admin oversight and the audit log", "Yes", "No"],
];

export default function AdminUsersPage() {
  const { ready, user: me } = useRequireAuth("Admin");
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: api.adminListUsers, enabled: ready });
  const requests = useQuery({ queryKey: ["password-reset-requests"], queryFn: api.adminPasswordResetRequests, enabled: ready, refetchInterval: 60_000 });
  const [resetting, setResetting] = useState<AdminUserDto | null>(null);
  const toast = useToast();
  const refreshRequests = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["password-reset-requests"] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
  ]);
  const dismiss = useMutation({
    mutationFn: (id: string) => api.adminDismissPasswordReset(id),
    onSuccess: async () => { await refreshRequests(); toast("Request dismissed"); },
  });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "Admin" | "Member" }) => api.adminUpdateRole(id, role),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
  if (!ready) return <SettingsState loading />;
  return <div className={s.page}>
    <SettingsHeader title="Team and invitations" context="Settings / Admin" description="The people in your workspace and what they can do" />
    <Feedback error={updateRole.error ?? dismiss.error} message={updateRole.isSuccess ? "Role updated. That person must sign in again." : null} />
    {users.isPending ? <SettingsState loading /> : users.isError ? <SettingsState error={users.error} retry={() => void users.refetch()} /> : users.data.length === 0 ? <SettingsState empty="No people to show" /> : <div className={s.people}>{users.data.map((person) => <article className={s.person} key={person.id}>
      <div className={s.identity}><Avatar name={person.displayName} /><div><b>{person.displayName}{person.id === me?.id && <small> (you)</small>}</b><p>{person.email}</p></div></div>
      <div className={s.meta}><Chip>{person.role}</Chip>{(() => { const asked = requests.data?.find((r) => r.userId === person.id); return asked && <Chip title={`Asked ${dateTime(asked.createdAt)}`}>Asked for a new password</Chip>; })()}<span>{person.mailboxCount ? `Connected ${person.mailboxCount} ${person.mailboxCount === 1 ? "mailbox" : "mailboxes"}` : "Connected no mailbox"}</span></div>
      <small className={s.note}>Last sign-in <time dateTime={person.lastLoginAt ?? undefined}>{dateTime(person.lastLoginAt)}</time></small>
      {person.id !== me?.id && <div className={s.meta}>
        <Button variant="ghost" disabled={updateRole.isPending} onClick={() => updateRole.mutate({ id: person.id, role: person.role === "Admin" ? "Member" : "Admin" })}>{person.role === "Admin" ? "Change to member" : "Make admin"}</Button>
        <Button variant="ghost" onClick={() => setResetting(person)}>Reset password</Button>
        {(() => { const asked = requests.data?.find((r) => r.userId === person.id); return asked && <Button variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(asked.id)}>Dismiss</Button>; })()}
      </div>}
    </article>)}</div>}
    <Panel><h2>What each role can do</h2><div className={s.matrix}><table><thead><tr><th scope="col">Permission</th><th scope="col">Admin</th><th scope="col">Member</th></tr></thead><tbody>{permissions.map(([permission, admin, member]) => <tr key={permission}><th scope="row">{permission}</th><td>{admin}</td><td>{member}</td></tr>)}</tbody></table></div><p className={s.note}>Permissions reflect the current API. Only the author or an admin can delete an internal note. Removing accounts is not available.</p></Panel>
    <InvitationsPanel />
    <ResetDialog person={resetting} onClose={() => setResetting(null)} onDone={refreshRequests} />
  </div>;
}

function ResetDialog({ person, onClose, onDone }: { person: AdminUserDto | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reset = useMutation({
    mutationFn: (id: string) => api.adminResetPassword(id),
    onSuccess: async (result) => { setPassword(result.newPassword); await onDone(); },
  });
  function close() {
    if (reset.isPending) return;
    // The password is shown once: forget it as soon as the dialog closes.
    setPassword(null); setCopied(false); reset.reset(); onClose();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(password!); setCopied(true); } catch { setCopied(false); }
  }
  return <ShellDialog open={!!person} onClose={close} labelId="reset-title">
    {password ? <>
      <h2 id="reset-title">New password for {person?.displayName}</h2>
      <div className={invite.copyRow}><code>{password}</code><Button variant="default" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button></div>
      <p className={s.note}>Give it to them in person or by phone. It will not be shown again. They can change it under Settings, Profile.</p>
      <div className={s.meta}><Button onClick={close}>Done</Button></div>
    </> : <>
      <h2 id="reset-title">Reset {person?.displayName}&apos;s password?</h2>
      <p className={s.note}>They will be signed out everywhere.</p>
      <div className={s.meta}><Button variant="ghost" disabled={reset.isPending} onClick={close}>Cancel</Button><Button variant="danger" disabled={reset.isPending} onClick={() => person && reset.mutate(person.id)}>{reset.isPending ? "Resetting" : "Reset password"}</Button></div>
      <Feedback error={reset.error} />
    </>}
  </ShellDialog>;
}
