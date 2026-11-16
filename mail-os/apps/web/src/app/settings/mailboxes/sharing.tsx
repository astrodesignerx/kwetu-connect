"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { Feedback, SettingsState } from "@/components/settings/settings";
import { CheckRow } from "@/components/settings/check-row";
import { MailDisclosure } from "@/components/mail/disclosure";
import { useToast } from "@/components/shell/toast";
import grid from "@/components/settings/check-row.module.css";
import s from "./page.module.css";

export function MailboxSharing({ id, email, userId }: { id: string; email: string; userId?: string }) {
  const client = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const members = useQuery({ queryKey: ["mailbox-access", id], queryFn: () => api.adminMailboxAccess(id) });
  const people = members.data ?? [];
  const saved = people.filter((person) => person.reason !== "none").map((person) => person.userId);
  const selected = chosen ?? saved;
  const dirty = selected.length !== saved.length || saved.some((personId) => !selected.includes(personId));
  const save = useMutation({
    mutationFn: () => api.adminSetMailboxAccess(id, selected),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["mailbox-access", id] });
      setChosen(null);
      toast(`Sharing updated for ${email}`);
    },
    onError: () => setChosen(null),
  });
  const rank = (reason: string) => reason === "admin" ? 0 : reason === "connected" ? 1 : 2;
  const ordered = [...people].sort((a, b) => rank(a.reason) - rank(b.reason) || a.displayName.localeCompare(b.displayName));
  const summary = people.length && saved.length === people.length ? "Everyone"
    : people.some((person) => person.userId === userId && person.reason === "connected")
      && people.every((person) => person.reason !== "granted") ? "Only admins and you"
      : `${saved.length} of ${people.length} people`;
  return <div className={s.sharing}>
    <button type="button" className={s.sharingToggle} aria-expanded={open} aria-controls={`access-${id}`} onClick={() => setOpen((value) => !value)}>
      <strong>Who can see this</strong><span>{members.isPending ? "Loading" : members.isError ? "Could not load" : summary}</span><ChevronRight size={16} aria-hidden="true" data-open={open} />
    </button>
    <MailDisclosure open={open} id={`access-${id}`}>
      {members.isPending ? <SettingsState loading /> : members.isError ? <SettingsState error={members.error} retry={() => void members.refetch()} /> : <>
        <div className={grid.grid}>{ordered.map((person) => <CheckRow key={person.userId} label={person.displayName} detail={person.email}
          checked={selected.includes(person.userId)} disabled={save.isPending || person.reason === "admin" || person.reason === "connected"}
          reason={person.reason === "admin" ? "Admin" : person.reason === "connected" ? "Connected it" : undefined}
          onChange={(checked) => { save.reset(); setChosen(checked ? [...selected, person.userId] : selected.filter((personId) => personId !== person.userId)); }} />)}</div>
        {dirty && <div className={s.sharingActions}><Button variant="ghost" disabled={save.isPending} onClick={() => { setChosen(null); save.reset(); }}>Cancel</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save"}</Button></div>}
        <Feedback error={save.error} />
      </>}
    </MailDisclosure>
  </div>;
}
