"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmailTemplateDto } from "@kompanion/types";
import { ArrowUpRight, CalendarDays, Check, ChevronRight, Layers, Users } from "lucide-react";
import { api } from "@/lib/api";
import { signalApi, type ThreadState } from "@/lib/signal-api";
import { ClientAvatar, StageTracker, StatusChip, type StageTrackerProps } from "@/components/signal";
import { ThreadAssignee, ThreadNotes } from "@/components/collaboration";
import { ThreadLinker } from "@/components/thread-linker";
import { MailDisclosure } from "./disclosure";
import s from "@/app/mail/page.module.css";

export function ThreadStateControl({ threadId, replyState }: { threadId: string; replyState: ThreadState["replyState"] }) {
  const cache = useQueryClient();
  const change = useMutation({
    mutationFn: () => signalApi.setThreadState(threadId, replyState === "Done" ? "ToReply" : "Done"),
    onSuccess: () => {
      for (const key of ["thread", "threads", "mail-brief", "overview", "thread-counts"]) void cache.invalidateQueries({ queryKey: [key] });
    },
  });
  return <div><button className={s.stateAction} aria-label={replyState === "Done" ? "Reopen" : "Mark done"} aria-pressed={replyState === "Done"} disabled={change.isPending} onClick={() => change.mutate()}><span className={s.toggle} aria-hidden /><span>{change.isPending ? "Saving..." : replyState === "Done" ? "Reopen" : "Mark done"}</span><small>{replyState === "Done" ? "Done" : replyState === "Awaiting" ? "Awaiting reply" : "Needs reply"}</small></button>
    {change.isError && <p role="alert">Could not change the conversation state. Try again.</p>}
  </div>;
}

export function ConversationChips({ threadId }: { threadId: string }) {
  const { data } = useQuery({ queryKey: ["thread-associations", threadId], queryFn: () => api.getThreadAssociations(threadId) });
  return <div className={s.chips}>{data?.company && <StatusChip label={data.company.name} colour="var(--muted)" />}{data?.projects.map((project) => <StatusChip key={project.id} label={project.name} colour="var(--muted)" dot={false} />)}</div>;
}

export function ConversationContext({ threadId, replyState, stateSince, onQuickReply }: { threadId: string; onQuickReply?: (template: EmailTemplateDto) => void } & ThreadState) {
  const [editingLinks, setEditingLinks] = useState(false);
  const associations = useQuery({ queryKey: ["thread-associations", threadId], queryFn: () => api.getThreadAssociations(threadId) });
  const flights = useQueries({ queries: (associations.data?.projects ?? []).map((project) => ({ queryKey: ["project-flights", project.id], queryFn: ({ signal }: { signal: AbortSignal }) => signalApi.flights(project.id, signal) })) });
  const company = associations.data?.company;
  const templates = useQuery({ queryKey: ["templates"], queryFn: api.listTemplates });
  const quickReply = useMutation({ mutationFn: api.getTemplate, onSuccess: (template) => onQuickReply?.(template) });
  const today = new Date().toLocaleDateString("en-CA");
  const stateLabel = replyState === "Done" ? "Conversation done" : replyState === "Awaiting" ? "Awaiting a reply" : "Needs your reply";
  const stages: StageTrackerProps["stages"][number][] = stateSince ? [{ id: "state", label: stateLabel, state: replyState === "Done" ? "done" : "now", date: new Date(stateSince).toLocaleDateString("en-GB"), dateTime: stateSince }] : [];
  for (const query of flights) for (const flight of query.data ?? []) stages.push({ id: flight.id, label: flight.siteName, state: flight.endDate < today ? "done" : flight.startDate <= today ? "now" : "next", date: `${flight.startDate} to ${flight.endDate}`, dateTime: flight.startDate });
  return <aside className={s.context} aria-label="Conversation context">
    <section className={s.contextCard}><h2><Users size={14} aria-hidden />Client</h2>
      {company ? <div className={s.clientCard}><ClientAvatar name={company.name} colour="var(--muted)" /><div><b>{company.name}</b><p>{company.domain}</p></div><Link href={`/clients/detail?id=${encodeURIComponent(company.id)}`}>Open workspace<ArrowUpRight size={14} aria-hidden /></Link></div> : <p className={s.muted}>{associations.isPending ? "Loading client..." : associations.isError ? "Client links could not load." : "No client linked."}</p>}
      {associations.isError && <button onClick={() => void associations.refetch()}>Try again</button>}
      <button type="button" className={s.contextAction} onClick={() => setEditingLinks((value) => !value)} aria-expanded={editingLinks}>{editingLinks ? "Close links" : company ? "Edit client and project links" : "Link a client"}</button>
      <MailDisclosure open={editingLinks}><ThreadLinker threadId={threadId} /></MailDisclosure>
    </section>
    <section className={s.contextCard}><h2><CalendarDays size={14} aria-hidden />Conversation and flights</h2>
      {stages.length > 0 ? <StageTracker label="Conversation and flight stages" stages={stages} /> : <p className={s.muted}>No flights linked.</p>}
      {flights.some((query) => query.isPending) && <p role="status" className={s.muted}>Loading flights...</p>}
      {flights.some((query) => query.isError) && <p role="alert" className={s.muted}>Flights could not load. <button onClick={() => flights.forEach((query) => void query.refetch())}>Try again</button></p>}
    </section>
    <section className={`${s.contextCard} ${s.conversationTools}`}><h2><Check size={14} aria-hidden />This conversation</h2>
      <ThreadStateControl threadId={threadId} replyState={replyState} />
      <ThreadAssignee threadId={threadId} />
      <ThreadNotes threadId={threadId} contextTools={false} />
    </section>
    <section className={s.contextCard}><h2><Layers size={14} aria-hidden />Quick replies<small>From templates</small></h2>
      {templates.isPending ? <p className={s.muted} role="status">Loading templates...</p> : templates.isError ? <p className={s.muted} role="alert">Templates could not load. <button onClick={() => void templates.refetch()}>Try again</button></p> : templates.data?.length ? <div className={s.quickReplies}>{templates.data.map((template) => <button key={template.id} disabled={!onQuickReply || quickReply.isPending} onClick={() => quickReply.mutate(template.id)}>{template.name}<ChevronRight size={14} aria-hidden /></button>)}</div> : <p className={s.muted}>No templates yet. <Link href="/settings/templates">Manage templates</Link></p>}
      {quickReply.isError && <p role="alert" className={s.muted}>This template could not open. Try again.</p>}
    </section>
  </aside>;
}
