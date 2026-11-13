"use client";

import { useThreadState } from './use-thread-state';
import { ErrorText } from "@/components/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import type { EmailTemplateDto } from "@kompanion/types";
import { ArrowUpRight, CalendarDays, Check, ChevronRight, Layers, Users } from "lucide-react";
import { api } from "@/lib/api";
import { signalApi, type ThreadState } from "@/lib/signal-api";
import { ClientAvatar, Meter, StatusChip } from "@/components/signal";
import { ThreadAssignee, ThreadNotes } from "@/components/collaboration";
import { ThreadLinker } from "@/components/thread-linker";
import { MailDisclosure } from "./disclosure";
import s from "@/app/mail/page.module.css";
import { formatDateRange, plural } from "@/lib/format";

export function ThreadStateControl({ threadId, replyState }: { threadId: string; replyState: ThreadState["replyState"] }) {
  const change = useThreadState(threadId, replyState);
  const done = replyState === "Done";
  return <div><button type="button" className={`reader-action ${s.doneAction}`} data-done={done} aria-label={done ? "Reopen" : "Mark done"} title={done ? "Reopen" : "Mark done"} disabled={change.isPending} onClick={() => change.mutate()}><Check size={16} aria-hidden />{done ? "Done" : "Mark done"}</button>
    {change.isError && <ErrorText>Could not change the conversation state. Try again.</ErrorText>}
  </div>;
}

export function ConversationChips({ threadId }: { threadId: string }) {
  const { data } = useQuery({ queryKey: ["thread-associations", threadId], queryFn: () => api.getThreadAssociations(threadId) });
  return <div className={s.chips}>{data?.company && <StatusChip label={data.company.name} />}{data?.projects.map((project) => <StatusChip key={project.id} label={project.name} dot={false} />)}</div>;
}

export function ConversationContext({ threadId, onQuickReply }: { threadId: string; onQuickReply?: (template: EmailTemplateDto) => void } & ThreadState) {
  const [editingLinks, setEditingLinks] = useState(false);
  const associations = useQuery({ queryKey: ["thread-associations", threadId], queryFn: () => api.getThreadAssociations(threadId) });
  const flights = useQueries({ queries: (associations.data?.projects ?? []).map((project) => ({ queryKey: ["project-flights", project.id], queryFn: ({ signal }: { signal: AbortSignal }) => signalApi.flights(project.id, signal) })) });
  const company = associations.data?.company;
  const templates = useQuery({ queryKey: ["templates"], queryFn: api.listTemplates });
  const quickReply = useMutation({ mutationFn: api.getTemplate, onSuccess: (template) => onQuickReply?.(template) });
  const [today, setToday] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }));
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" })), 60_000);
    return () => clearInterval(timer);
  }, []);
  const linkedFlights = flights.flatMap((query) => query.data ?? []);
  return <aside className={`${s.context} scroll-cue`} aria-label="Conversation context">
    <section className={s.contextCard}><h2><Users size={14} aria-hidden />Client</h2>
      {company ? <div className={s.clientCard}><ClientAvatar name={company.name} /><div><b>{company.name}</b><p>{company.domain}</p></div><Link href={`/clients/detail?id=${encodeURIComponent(company.id)}`}>Open workspace<ArrowUpRight size={14} aria-hidden /></Link></div> : <p className={s.muted}>{associations.isPending ? "Loading client..." : associations.isError ? "Client links could not load" : "No client linked"}</p>}
      {associations.isError && <button onClick={() => void associations.refetch()}>Try again</button>}
      <button type="button" className={s.contextAction} onClick={() => setEditingLinks((value) => !value)} aria-expanded={editingLinks}>{editingLinks ? "Close links" : company ? "Edit client and project links" : "Link a client"}</button>
      <MailDisclosure open={editingLinks}><ThreadLinker threadId={threadId} /></MailDisclosure>
    </section>
    <section className={s.contextCard}><h2><CalendarDays size={14} aria-hidden />On screen</h2>
      {linkedFlights.length > 0 ? <ul className={s.screenFlights}>{linkedFlights.map((flight) => {
        const day = 86_400_000;
        const start = Date.parse(flight.startDate);
        const end = Date.parse(flight.endDate) + day;
        const now = Date.parse(today);
        const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
        const state = now >= end ? "Ended" : now >= start ? "On screen now" : `Starts in ${plural(Math.ceil((start - now) / day), "day")}`;
        return <li key={flight.id}><b>{flight.siteName}</b><span>{formatDateRange(flight.startDate, flight.endDate)}</span><span>{state}</span><Meter value={elapsed} variant="progress" label={`${flight.siteName}: elapsed run`} /></li>;
      })}</ul> : !associations.isPending && !associations.isError && !flights.some((query) => query.isPending || query.isError) && <p className={s.muted}>No flights linked</p>}
      {flights.some((query) => query.isPending) && <p role="status" className={s.muted}>Loading flights...</p>}
      {flights.some((query) => query.isError) && <p role="alert" className={s.muted}>Flights could not load. <button onClick={() => flights.forEach((query) => void query.refetch())}>Try again</button></p>}
    </section>
    <section className={s.contextCard}><h2><Check size={14} aria-hidden />Team</h2>
      <ThreadAssignee threadId={threadId} />
      <ThreadNotes threadId={threadId} contextTools={false} />
    </section>
    <section className={s.contextCard}><h2><Layers size={14} aria-hidden />Quick replies<small>From templates</small></h2>
      {templates.isPending ? <p className={s.muted} role="status">Loading templates...</p> : templates.isError ? <p className={s.muted} role="alert">Templates could not load. <button type="button" className={s.retryLink} onClick={() => void templates.refetch()}>Try again</button></p> : templates.data?.length ? <div className={s.quickReplies}>{templates.data.map((template) => <button type="button" key={template.id} title={template.name} disabled={!onQuickReply || quickReply.isPending} onClick={() => quickReply.mutate(template.id)}><span>{template.name}</span><ChevronRight size={14} aria-hidden /></button>)}</div> : <p className={s.muted}>No templates yet. <Link href="/settings/templates">Manage templates</Link></p>}
      {quickReply.isError && <ErrorText>This template could not open. Try again.</ErrorText>}
    </section>
  </aside>;
}
