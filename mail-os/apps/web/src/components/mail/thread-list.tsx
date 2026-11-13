"use client";
import { WaitingPill } from './waiting-pill';
import { EmptyState } from "@/components/empty-state";
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Inbox, Paperclip, Search } from 'lucide-react';
import { groupThreads } from '@/lib/signal-mail';
import type { MailThreadSummary as SignalThreadSummary } from '@/lib/signal-mail';
import { ClientAvatar } from '@/components/signal';
import { Button } from '@/components/ui';
import s from '@/app/mail/page.module.css';
import { motionTime, useReducedMotion } from './motion';
import { formatWhen } from '@/lib/format';

type ThreadListProps = {
  items: SignalThreadSummary[]; loading: boolean; selectedId: string | null; onSelect: (id: string) => void;
  selection: Set<string>; onToggleSelect: (id: string) => void; total: number; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void; query?: string; viewKey?: string;
};

export function ThreadList(props: ThreadListProps) {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState(props);
  const switching = displayed.viewKey !== props.viewKey;
  if ((!switching || reduce) && displayed !== props) setDisplayed(props);
  useEffect(() => {
    if (!switching || reduce) return;
    const timer = setTimeout(() => setDisplayed(props), motionTime("--t1"));
    return () => clearTimeout(timer);
  }, [switching, reduce, props]);
  return <div className={s.listTransition} inert={switching && !reduce} data-leaving={switching && !reduce}>
    <ThreadRows key={displayed.viewKey} {...(switching && !reduce ? displayed : props)} />
  </div>;
}

function ThreadRows({ items, loading, selectedId, onSelect, selection, onToggleSelect, total, hasMore, loadingMore, onLoadMore, query }: ThreadListProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const reduce = useReducedMotion();
  const [hasLoaded, setHasLoaded] = useState(!loading);
  if (!loading && !hasLoaded) setHasLoaded(true);
  const [previous, setPrevious] = useState(items);
  const [retained, setRetained] = useState(items);
  const [arriving, setArriving] = useState<string[]>([]);
  if (items !== previous) {
    setPrevious(items);
    setArriving(hasLoaded ? items.filter((item) => !previous.some((old) => old.id === item.id)).map((item) => item.id) : []);
    const next = [...items];
    if (!reduce) retained.forEach((item, index) => {
      if (!items.some((row) => row.id === item.id)) next.splice(index, 0, item);
    });
    setRetained(next);
  }
  const leaving = retained.some((item) => !items.some((row) => row.id === item.id));
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setRetained(items), motionTime("--t2") * 2);
    return () => clearTimeout(timer);
  }, [items, leaving, reduce]);
  if (loading) return <div className={s.quiet} role="status">Loading conversations...</div>;
  if (!retained.length) return query ? <EmptyState bare icon={Search} title="No matches" text="No conversations match this search" /> : <EmptyState bare icon={Inbox} title="No conversations" text="Nothing in this folder yet" />;
  const groups = query ? [{ label: 'Conversations', items: retained }] : groupThreads(retained);
  return <div className={s.listBody}>{groups.map((group) => <section key={group.label} aria-label={group.label}>
    <h2 className={s.groupLabel}>{group.label}</h2>
    <ul>{group.items.map((item) => <li key={item.id} className={s.rowSlot} data-leaving={!items.some((row) => row.id === item.id)} data-arriving={arriving.includes(item.id)} aria-hidden={!items.some((row) => row.id === item.id)} inert={!items.some((row) => row.id === item.id)} style={{ '--stagger': reduce ? '0ms' : `${Math.min(retained.indexOf(item), 8) * 20}ms` } as CSSProperties}><div className={s.rowClip}><ThreadRow thread={item} active={item.id === selectedId} picked={selection.has(item.id)}
      onSelect={() => onSelect(item.id)} onToggle={() => onToggleSelect(item.id)} query={query} now={now} /></div></li>)}</ul>
  </section>)}<div className={s.quiet}>{hasMore && <Button variant="ghost" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more'}</Button>}<p>{items.length} of {total}</p></div></div>;
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark><Highlight text={text.slice(index + query.length)} query={query} /></>;
}

function ThreadRow({ thread: t, active, picked, onSelect, onToggle, query, now }: { thread: SignalThreadSummary; active: boolean; picked: boolean; onSelect: () => void; onToggle: () => void; query?: string; now: number }) {
  const who = firstParticipant(t.participants) || '(unknown sender)';
  return <div className={s.row} data-active={active} data-unread={t.hasUnread}>
    <button className={s.avatarButton} role="checkbox" aria-checked={picked} aria-label={picked ? 'Deselect thread' : 'Select thread'} onClick={onToggle}>
      {picked ? <Check size={16} aria-hidden /> : <ClientAvatar name={who} size="small" />}
    </button>
    <button className={s.rowButton} aria-current={active ? 'true' : undefined} onClick={onSelect}>
      <span className={s.rowTop}>{t.hasUnread && <span className={s.unread} aria-label="Unread" />}<b><Highlight text={who} query={query} /></b><time>{t.lastDate ? formatRelative(t.lastDate) : ''}</time></span>
      <span className={s.subject}><Highlight text={t.subject || '(no subject)'} query={query} /> {t.hasAttachments && <Paperclip size={14} className="inline" aria-label="Has attachments" />}</span>
      <span className={s.snippet}><Highlight text={t.snippet ?? ''} query={query} /></span>
      <span className={s.rowMeta}><span>{t.clientName || (t.hasAttachments ? 'Files attached' : `${t.messageCount} message${t.messageCount === 1 ? '' : 's'}`)}</span>
        {t.replyState === 'ToReply' && <WaitingPill seconds={(now - new Date(t.stateSince).getTime()) / 1000} />}
      </span>
    </button>
  </div>;
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
