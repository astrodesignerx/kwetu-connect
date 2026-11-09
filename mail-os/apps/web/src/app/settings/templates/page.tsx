"use client";

import { ErrorText } from "@/components/ui";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { labelFor } from "@/lib/merge-fields";
import { displayDate } from "@/lib/signal-clients";
import { Button, ViewState, buttonClass } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { TemplateThumbnail } from "./template-thumbnail";
import s from "./page.module.css";

export default function TemplatesPage() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["template-previews"], queryFn: api.listTemplatePreviews });
  const templates = [...(query.data ?? [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const remove = useMutation({ mutationFn: api.deleteTemplate, onSuccess: () => {
    void cache.invalidateQueries({ queryKey: ["template-previews"] });
    void cache.invalidateQueries({ queryKey: ["templates"] });
  } });
  const latest = templates[0];
  return <div className={s.page}>
    <PageHeader title="Templates" description="Messages your team sends again and again" action={latest ? <Link href="/settings/templates/new" className={buttonClass()}>New template</Link> : undefined} />
    {query.isPending ? <ViewState loading label="Loading templates" /> : query.isError ? <div role="alert"><p>Could not load templates</p><Button variant="default" onClick={() => void query.refetch()}>Try again</Button></div> : !latest ? <EmptyState icon={Layers} title="No templates yet" text="Create a template for an update, proposal or handover" action={<Link href="/settings/templates/new" className={buttonClass()}>New template</Link>} /> : <>
      <section className={s.feature}>
        <div className={s.featureBody}><p className={s.sectionLabel}>Most recently edited</p><h2>{latest.name}</h2><p className={s.muted}>{latest.description || latest.subject || "Ready to personalise"}</p><span className={s.date}>Edited <time dateTime={latest.updatedAt}>{displayDate(latest.updatedAt)}</time></span><Link href={`/settings/templates/edit?id=${encodeURIComponent(latest.id)}`} className={buttonClass("default")}>Edit template</Link><Button variant="ghost" size="small" disabled={remove.isPending} onClick={() => { if (confirm(`Delete template ${latest.name}?`)) remove.mutate(latest.id); }}>Delete template</Button></div>
        <TemplateThumbnail html={latest.bodyHtml} name={latest.name} />
      </section>
      <div className={s.grid}>{templates.slice(1).map(t => <article key={t.id} className={s.card}>
        <Link href={`/settings/templates/edit?id=${encodeURIComponent(t.id)}`} tabIndex={-1} aria-hidden="true"><TemplateThumbnail html={t.bodyHtml} name={t.name} /></Link>
        <div className={s.cardBody}><h2><Link href={`/settings/templates/edit?id=${encodeURIComponent(t.id)}`}>{t.name}</Link></h2><p className={s.muted}>{t.subject || t.description || "(no subject)"}</p><div className={s.fields}>{t.variables.slice(0, 3).map(v => <span key={v}>{labelFor(v)}</span>)}{t.variables.length > 3 && <span>+{t.variables.length - 3} fields</span>}</div><div className={s.cardFoot}><time className={s.date} dateTime={t.updatedAt}>{displayDate(t.updatedAt)}</time><Button variant="ghost" size="small" disabled={remove.isPending} onClick={() => { if (confirm(`Delete template ${t.name}?`)) remove.mutate(t.id); }}>Delete</Button></div></div>
      </article>)}</div>
    </>}
    {remove.isError && <ErrorText>{remove.error.message}</ErrorText>}
  </div>;
}
