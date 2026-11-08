"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { Button, Chip } from "@/components/ui";
import { InvitationsPanel } from "@/components/invitations";
import { Avatar, Feedback, Panel, SettingsHeader, SettingsState, dateTime } from "@/components/settings/settings";
import s from "./page.module.css";

const permissions = [
  ["Read every synced mailbox", "Yes", "Yes"],
  ["Send and manage mailbox connections", "Own mailboxes", "Own mailboxes"],
  ["Assign threads, add notes, manage clients", "Yes", "Yes"],
  ["Edit templates and email appearance", "Yes", "Yes"],
  ["Invite people and change roles", "Yes", "No"],
  ["View admin oversight and the audit log", "Yes", "No"],
];

export default function AdminUsersPage() {
  const { ready, user: me } = useRequireAuth("Admin");
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: api.adminListUsers, enabled: ready });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "Admin" | "Member" }) => api.adminUpdateRole(id, role),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin-users"] }); },
  });
  if (!ready) return <SettingsState loading />;
  return <div className={s.page}>
    <SettingsHeader title="Team and invitations" context="Settings / Admin" description="The people in your workspace and what they can do." />
    <Feedback error={updateRole.error} message={updateRole.isSuccess ? "Role updated. That person must sign in again." : null} />
    {users.isPending ? <SettingsState loading /> : users.isError ? <SettingsState error={users.error} retry={() => void users.refetch()} /> : users.data.length === 0 ? <SettingsState empty="No people to show" /> : <div className={s.people}>{users.data.map((person) => <article className={s.person} key={person.id}>
      <div className={s.identity}><Avatar name={person.displayName} /><div><b>{person.displayName}{person.id === me?.id && <small> (you)</small>}</b><p>{person.email}</p></div></div>
      <div className={s.meta}><Chip hue={person.role === "Admin" ? "var(--jac)" : "var(--muted)"}>{person.role}</Chip><span>{person.mailboxCount} mailboxes</span></div>
      <small className={s.note}>Last sign-in {dateTime(person.lastLoginAt)}</small>
      {person.id !== me?.id && <Button variant="ghost" disabled={updateRole.isPending} onClick={() => updateRole.mutate({ id: person.id, role: person.role === "Admin" ? "Member" : "Admin" })}>{person.role === "Admin" ? "Change to member" : "Make admin"}</Button>}
    </article>)}</div>}
    <Panel><h2>What each role can do</h2><div className={s.matrix}><table><thead><tr><th scope="col">Permission</th><th scope="col">Admin</th><th scope="col">Member</th></tr></thead><tbody>{permissions.map(([permission, admin, member]) => <tr key={permission}><th scope="row">{permission}</th><td>{admin}</td><td>{member}</td></tr>)}</tbody></table></div><p className={s.note}>Permissions reflect the current API. Only the author or an admin can delete an internal note. Removing accounts is not available.</p></Panel>
    <InvitationsPanel />
  </div>;
}
