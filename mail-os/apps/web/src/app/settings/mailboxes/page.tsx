"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MailboxDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { settingsApi, utcHourValues } from "@/lib/signal-settings";
import { HourBars } from "@/components/signal";
import { Button, buttonClass } from "@/components/ui";
import { ShellDialog } from "@/components/shell/dialog";
import { Feedback, HealthLight, Panel, SettingsHeader, SettingsState, Stat, dateTime } from "@/components/settings/settings";
import s from "./page.module.css";

export default function MailboxesPage() {
  const queryClient = useQueryClient();
  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: api.listMailboxes, refetchInterval: 30_000 });
  const [removing, setRemoving] = useState<MailboxDto | null>(null);
  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectMailbox(id),
    onSuccess: async () => {
      setRemoving(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mailboxes"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
      ]);
    },
  });

  return <div className={s.page}>
    <SettingsHeader title="Mailboxes" context="Settings / Personal" description="The email accounts your workspace reads and sends from" action={mailboxes.data?.length ? <Link className={buttonClass()} href="/settings/mailboxes/connect">Connect mailbox</Link> : undefined} />
    {!removing && <Feedback error={disconnect.error} />}
    {mailboxes.isPending ? <SettingsState loading /> : mailboxes.isError ? <SettingsState error={mailboxes.error} retry={() => void mailboxes.refetch()} /> : mailboxes.data.length === 0 ? <div className={s.empty}><SettingsState empty="No mailbox connected" /><Link className={buttonClass()} href="/settings/mailboxes/connect">Connect mailbox</Link></div> : <div className={s.list}>{mailboxes.data.map((mailbox) => <MailboxHealth key={mailbox.id} mailbox={mailbox} onDisconnect={() => { disconnect.reset(); setRemoving(mailbox); }} />)}</div>}
    <ShellDialog open={!!removing} onClose={() => { if (!disconnect.isPending) setRemoving(null); }} labelId="disconnect-title">
      <h2 id="disconnect-title">Disconnect this mailbox?</h2>
      <p className={s.dialogText}>{removing?.email} and its synced mail will leave this workspace. Messages stay on your mail server. You can reconnect later.</p>
      <div className={s.actions}><Button variant="ghost" disabled={disconnect.isPending} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={disconnect.isPending} onClick={() => removing && disconnect.mutate(removing.id)}>{disconnect.isPending ? "Disconnecting..." : "Disconnect mailbox"}</Button></div>
      <Feedback error={disconnect.error} />
    </ShellDialog>
  </div>;
}

function MailboxHealth({ mailbox, onDisconnect }: { mailbox: MailboxDto; onDisconnect: () => void }) {
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["sync-stats", mailbox.id], queryFn: ({ signal }) => settingsApi.syncStats(mailbox.id, signal), refetchInterval: 30_000 });
  const [message, setMessage] = useState("");
  const refresh = async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["mailboxes"] }),
    queryClient.invalidateQueries({ queryKey: ["sync-stats", mailbox.id] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-overview"] }),
  ]); };
  const sync = useMutation({ mutationFn: () => api.triggerMailboxSync(mailbox.id), onMutate: () => setMessage(""), onSuccess: async () => { setMessage("Sync queued. The numbers update when messages have been fetched."); await refresh(); } });
  const test = useMutation({ mutationFn: () => api.reverifyMailbox(mailbox.id), onMutate: () => setMessage(""), onSuccess: async () => { setMessage("Saved credentials verified successfully over IMAP"); await refresh(); } });
  return <Panel><div className={s.health}>
    <div className={s.identity}>{stats.data && <HealthLight state={stats.data.syncState} />}<h2>{mailbox.email}</h2><p>Receiving: {mailbox.imapHost}:{mailbox.imapPort}<br />Sending: {mailbox.smtpHost}:{mailbox.smtpPort}</p><p>Last verified <time dateTime={mailbox.lastVerifiedAt ?? undefined}>{dateTime(mailbox.lastVerifiedAt)}</time></p>
      {stats.data && <div className={s.numbers}><Stat value={stats.data.conversationCount} label={stats.data.conversationCount === 1 ? "conversation" : "conversations"} /><Stat value={stats.data.messagesSynced} label="fetched in the last 24 hours" />{stats.data.errorCount24Hours !== null && <Stat value={stats.data.errorCount24Hours} label={stats.data.errorCount24Hours === 1 ? "error in the last 24 hours" : "errors in the last 24 hours"} />}</div>}
      <p>Last sync <time dateTime={stats.data?.lastSyncCompletedAt ?? undefined}>{dateTime(stats.data?.lastSyncCompletedAt)}</time></p>
      <Feedback error={stats.data?.syncError} />
    </div>
    <div className={s.chart}><h3>Messages fetched in the last 24 hours</h3>
      {stats.isPending ? <SettingsState loading /> : stats.isError ? <SettingsState error={stats.error} retry={() => void stats.refetch()} /> : <><HourBars values={utcHourValues(stats.data.hourly)} highlightPeak={false} height={150} label="Fetched messages in the last 24 hours, grouped by UTC hour of day" /><p className={s.note}>Last 24 hours, grouped by UTC hour of day</p></>}
      <div className={s.actions}><Button variant="default" disabled={sync.isPending || test.isPending} onClick={() => sync.mutate()}>{sync.isPending ? "Queuing..." : "Sync now"}</Button><Button variant="ghost" disabled={test.isPending || sync.isPending} onClick={() => test.mutate()}>{test.isPending ? "Testing..." : "Test connection"}</Button><Button variant="danger" onClick={onDisconnect}>Disconnect mailbox</Button></div>
      <Feedback error={test.error ?? sync.error} message={message} />
    </div>
  </div></Panel>;
}
