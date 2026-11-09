"use client";

import { ErrorText } from "@/components/ui";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import type { CompanyDto } from "@kompanion/types";
import s from "./forms.module.css";

export function ClientForm({ initial, onDone }: { initial?: CompanyDto; onDone: () => void }) {
  const cache = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), domain: domain.trim() || null, notes: notes.trim() || null };
      if (initial) await api.updateCompany(initial.id, body);
      else await api.createCompany(body);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["companies"] });
      void cache.invalidateQueries({ queryKey: ["company"] });
      void cache.invalidateQueries({ queryKey: ["client-activity"] });
      onDone();
    },
  });
  return <form className={s.form} onSubmit={e => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}>
    <h2>{initial ? "Edit client" : "New client"}</h2>
    <div className={s.fields}>
      <label>Name<input autoFocus required value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email domain<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="company.co.ke" /></label>
    </div>
    <label>Internal notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    {save.isError && <ErrorText>{save.error.message}</ErrorText>}
    <div className={s.actions}><Button type="button" variant="ghost" onClick={onDone} disabled={save.isPending}>Cancel</Button><Button disabled={!name.trim() || save.isPending}>{save.isPending ? "Saving..." : initial ? "Save changes" : "Create client"}</Button></div>
  </form>;
}
