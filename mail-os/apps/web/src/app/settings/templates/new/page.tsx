"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { variablesIn } from "@/lib/merge-fields";
import s from "./page.module.css";

const STARTER_SUBJECT = "Update on {{project_name}}";
const STARTER_BODY = "<p>Hi {{client_name}},</p><p>Here's a quick update on <strong>{{project_name}}</strong>.</p><p>Write the rest here.</p><p>Thanks,<br>{{sender_name}}</p>";

export default function NewTemplatePage() {
  const router = useRouter();
  const cache = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("update");
  const create = useMutation({
    mutationFn: () => {
      const subject = start === "update" ? STARTER_SUBJECT : "";
      const bodyHtml = start === "update" ? STARTER_BODY : "<p></p>";
      return api.createTemplate({ name: name.trim(), description: description.trim() || null, subject, bodyHtml, variables: variablesIn(subject, bodyHtml), skipBrandWrap: false });
    },
    onSuccess: template => {
      void cache.invalidateQueries({ queryKey: ["templates"] });
      void cache.invalidateQueries({ queryKey: ["template-previews"] });
      router.push(`/settings/templates/edit?id=${encodeURIComponent(template.id)}`);
    },
  });
  return <form className={s.page} onSubmit={e => { e.preventDefault(); if (name.trim() && !create.isPending) create.mutate(); }}>
    <header><p className={s.sectionLabel}>New template</p><h1>A message worth keeping.</h1></header>
    <section className={s.step}><div className={s.stepLabel}><span>01</span><h2>Name</h2></div><label className={s.name}>What will your team call it?<input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Weekly campaign update" /></label><label className={s.description}>What it&apos;s for (optional)<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Friday updates for live campaigns" /></label></section>
    <fieldset className={s.step}><legend className={s.stepLabel}><span>02</span>Starting point</legend><div className={s.options}>{[{ id: "blank", title: "Blank page", description: "Write it from scratch." }, { id: "update", title: "Personalised update", description: "Begin with client, project and sender fields." }].map(option => <label className={s.option} key={option.id}><input type="radio" name="start" value={option.id} checked={start === option.id} onChange={() => setStart(option.id)} /><strong>{option.title}</strong><small>{option.description}</small></label>)}</div></fieldset>
    {create.isError && <p role="alert" className={s.error}>{create.error.message}</p>}
    <footer className={s.actions}><Button type="button" variant="ghost" onClick={() => router.push("/settings/templates")} disabled={create.isPending}>Cancel</Button><Button disabled={!name.trim() || create.isPending}>{create.isPending ? "Creating..." : "Create and start writing"}</Button></footer>
  </form>;
}
