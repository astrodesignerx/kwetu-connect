"use client";

import { ErrorState } from "@/components/empty-state";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { clientsApi, displayDate, replyDuration } from "@/lib/signal-clients";
import { ClientAvatar, StatusChip } from "@/components/signal";
import { Button, ViewState, buttonClass } from "@/components/ui";
import { ClientForm } from "@/components/clients/client-form";
import { ClientProjects } from "@/components/clients/client-projects";
import s from "./page.module.css";
import { PageHeader } from "@/components/page-header";
import { formatDateRange, plural } from "@/lib/format";

export default function ClientDetailPage() {
  return <Suspense fallback={<ViewState loading label="Loading client" />}><ClientLookup /></Suspense>;
}

function ClientLookup() {
  const id = useSearchParams().get("id") ?? "";
  return id ? <ClientWorkspace key={id} id={id} /> : <p>Choose a client from <Link href="/clients">the directory</Link>.</p>;
}

function ClientWorkspace({ id }: { id: string }) {
  const cache = useQueryClient();
  const router = useRouter();
  const company = useQuery({ queryKey: ["company", id], queryFn: () => api.getCompany(id) });
  const insights = useQuery({ queryKey: ["client-insights", id], queryFn: ({ signal }) => clientsApi.insights(id, signal), refetchInterval: 60000 });
  const [editing, setEditing] = useState(false);
  const remove = useMutation({ mutationFn: () => api.deleteCompany(id), onSuccess: () => {
    void cache.invalidateQueries({ queryKey: ["companies"] });
    void cache.invalidateQueries({ queryKey: ["client-activity"] });
    router.push("/clients");
  } });
  if (company.isPending) return <ViewState loading label="Loading client" />;
  if (company.isError) return <ErrorState title="This client could not load" message={company.error.message} action={<Link href="/clients" className={buttonClass("default")}>Back to clients</Link>} />;
  const data = company.data;
  const stats = insights.data;
  return <div className={s.page}>
    <PageHeader context="Clients" contextHref="/clients" title={data.company.name}
      meta={<><span>{data.company.domain || "No domain added"}</span>{stats && <StatusChip label={stats.waitingCount > 0 ? "Waiting on us" : "All replied"} strong={stats.waitingCount > 0} />}</>}
      action={<Button variant="default" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit client"}</Button>} />
    {editing && <ClientForm initial={data.company} onDone={() => setEditing(false)} />}
    {insights.isPending ? <p className={s.muted} role="status">Loading client insights...</p> : insights.isError ? <div role="alert" className={s.error}>Could not load insights. <Button variant="ghost" onClick={() => void insights.refetch()}>Try again</Button></div> : stats && <dl className={s.kpis}>
      <div><dt>Boards booked</dt><dd>{stats.boardsBooked}</dd><small><time dateTime={stats.startDate}>{formatDateRange(stats.startDate, stats.endDate)}</time></small></div>
      <div><dt>Median first reply</dt><dd>{replyDuration(stats.firstReply.medianSeconds)}</dd><small>{plural(stats.firstReply.count, "reply", "replies")} in the last {stats.firstReply.days} days</small></div>
      <div><dt>Last contact</dt><dd className={s.date}>{displayDate(stats.lastContactAt)}</dd></div>
    </dl>}
    {data.company.notes && <p className={s.notes}>{data.company.notes}</p>}
    <ClientProjects companyId={id} projects={data.projects} />
    <section className={s.panel}>
      <div className={s.sectionHead}><h2>People</h2><span className={s.muted}>{plural(data.contacts.length, "contact")}</span></div>
      {!data.contacts.length ? <p className={s.muted}>Add the client&apos;s email domain to discover people from message addresses</p> : <ul className={s.rows}>{data.contacts.map(contact => <li key={contact.id}>
        <ClientAvatar name={contact.name || contact.email} size="small" /><div className={s.grow}><strong>{contact.name || contact.email}</strong><small>{contact.email}</small></div><small className={s.muted}>{plural(contact.messageCount, "message")}</small>
      </li>)}</ul>}
    </section>
    <section className={s.panel}>
      <div className={s.sectionHead}><h2>Communication history</h2><Link href="/mail" className={s.back}>Link conversations in Mail</Link></div>
      {!data.threads.length ? <p className={s.muted}>Open a conversation in Mail and use Tag to client to link it here</p> : <ol className={s.timeline}>{data.threads.map(thread => {
        const state = stats?.recentThreads.find(t => t.id === thread.id);
        return <li key={thread.id}><time dateTime={thread.lastDate ?? undefined}>{displayDate(thread.lastDate)}</time><span className={s.dot} aria-hidden="true" /><Link href={`/mail?id=${encodeURIComponent(thread.id)}`}>
          <strong>{thread.subject || "(no subject)"}</strong><small>{thread.snippet || thread.participants}</small>
          {state && <StatusChip label={state.replyState === "ToReply" ? "Waiting on us" : state.replyState === "Awaiting" ? "Awaiting reply" : "Done"} strong={state.replyState === "ToReply"} />}
        </Link></li>;
      })}</ol>}
    </section>
    <footer className={s.footer}><Button variant="ghost" disabled={remove.isPending} onClick={() => { if (confirm(`Delete client ${data.company.name}, its projects and flights?`)) remove.mutate(); }}>Delete client</Button>{remove.isError && <p role="alert" className={s.error}>{remove.error.message}</p>}</footer>
  </div>;
}
