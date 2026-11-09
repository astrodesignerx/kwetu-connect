"use client";
import { EmptyState } from "@/components/empty-state";
import { useEffect, useState } from 'react';
import { Check, Inbox, Paperclip, Search } from 'lucide-react';
import { groupThreads, durationLabel } from '@/lib/signal-mail';
import type { MailThreadSummary as SignalThreadSummary } from '@/lib/signal-mail';
import { ClientAvatar } from '@/components/signal';
import { Button } from '@/components/ui';
import s from '@/app/mail/page.module.css';
import { formatWhen } from '@/lib/format';

export function ThreadList({ items, loading, selectedId, onSelect, selection, onToggleSelect, total, hasMore, loadingMore, onLoadMore, query }: {
  items: SignalThreadSummary[]; loading: boolean; selectedId: string | null; onSelect: (id: string) => void;
  selection: Set<string>; onToggleSelect: (id: string) => void; total: number; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; query?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (loading) return <div className={s.quiet} role="status">Loading conversations...</div>;
  if (!items.length) return query ? <EmptyState bare icon={Search} title="No matches" text="No conversations match this search" /> : <EmptyState bare icon={Inbox} title="No conversations" text="Nothing in this folder yet" />;
  const groups = query ? [{ label: 'Conversations', items }] : groupThreads(items);
  return <div className={s.listBody}>{groups.map((group) => <section key={group.label} aria-label={group.label}>
    <h2 className={s.groupLabel}>{group.label}</h2>
    <ul>{group.items.map((item, index) => <ThreadRow key={item.id} thread={item} active={item.id === selectedId} picked={selection.has(item.id)}
      onSelect={() => onSelect(item.id)} onToggle={() => onToggleSelect(item.id)} index={index} query={query} now={now} />)}</ul>
  </section>)}<div className={s.quiet}>{hasMore && <Button variant="ghost" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</Button>}<p>{items.length} of {total}</p></div></div>;
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark><Highlight text={text.slice(index + query.length)} query={query} /></>;
}

function ThreadRow({ thread: t, active, picked, onSelect, onToggle, index, query, now }: { thread: SignalThreadSummary; active: boolean; picked: boolean; onSelect: () => void; onToggle: () => void; index: number; query?: string; now: number }) {
  const who = firstParticipant(t.participants) || '(unknown sender)';
  return <li className={s.row} data-active={active} style={{ animationDelay: Math.min(index, 6) * 50 + 'ms' }}>
    <button className={s.avatarButton} role="checkbox" aria-checked={picked} aria-label={picked ? 'Deselect thread' : 'Select thread'} onClick={onToggle}>
      {picked ? <Check size={16} aria-hidden /> : <ClientAvatar name={who} size="small" />}
    </button>
    <button className={s.rowButton} aria-current={active ? 'true' : undefined} onClick={onSelect}>
      <span className={s.rowTop}>{t.hasUnread && <span className={s.unread} aria-label="Unread" />}<b><Highlight text={who} query={query} /></b><time>{t.lastDate ? formatRelative(t.lastDate) : ''}</time></span>
      <span className={s.subject}><Highlight text={t.subject || '(no subject)'} query={query} /> {t.hasAttachments && <Paperclip size={14} className="inline" aria-label="Has attachments" />}</span>
      <span className={s.snippet}><Highlight text={t.snippet ?? ''} query={query} /></span>
      <span className={s.rowMeta}><span>{t.clientName || (t.hasAttachments ? 'Files attached' : `${t.messageCount} message${t.messageCount === 1 ? '' : 's'}`)}</span>
        {t.replyState === 'ToReply' && <span className={s.waitingLabel}>Waiting {durationLabel(Math.max(0, (now - new Date(t.stateSince).getTime()) / 1000))}</span>}
      </span>
    </button>
  </li>;
}

/** The first display name in the participant list, for the row avatar and sender line. */
function firstParticipant(participants: string | null): string {
  if (!participants) return "";
  const first = participants.split(",")[0].trim();
  const named = first.match(/^(.*?)\s*<([^>]+)>$/);
  return (named ? named[1] || named[2] : first).trim();
}

function formatRelative(iso: string): string {
  return formatWhen(iso);
}
