"use client";
import { Clock, Paperclip, Star } from "@phosphor-icons/react";
import type { MessageRow } from "@/app/manage/(staff)/mail/actions";
import { dayGroup, initials, listTime, senderName, waitingFor } from "./mail-format";

export const rowKey = (m: Pick<MessageRow, "mailbox" | "uid">) => `${m.mailbox}:${m.uid}`;

/** The conversations in one folder, newest first, under Today, Yesterday, This week and Earlier. */
export default function MailList({ items, selected, sentFolder, inbox, loading, error, hasMore, onOpen, onMore, onRetry }: {
  items: MessageRow[]; selected: string | null; sentFolder: boolean; inbox: boolean; loading: boolean; error: string | null; hasMore: boolean;
  onOpen: (m: MessageRow) => void; onMore: () => void; onRetry: () => void;
}) {
  if (error && !items.length) return <div className="mg-mail-empty" role="alert"><p>{error}</p><button type="button" className="mg-pill" onClick={onRetry}>Try again</button></div>;
  if (!items.length) return loading ? <ListSkeleton /> : <div className="mg-mail-empty"><p>Nothing here.</p></div>;
  const now = new Date();
  const groups = new Map<string, MessageRow[]>();
  for (const m of items) { const g = dayGroup(m.date, now); groups.set(g, [...(groups.get(g) ?? []), m]); }
  return <div className="mg-mail-scroll" aria-busy={loading}>
    {[...groups].map(([group, rows]) => <section key={group} aria-label={group}>
      <h3 className="mg-mail-group">{group}</h3>
      <ul className="mg-mail-rows">
        {rows.map((m) => {
          const person = sentFolder ? (m.to[0] ? senderName(m.to[0]) : "No recipient") : senderName(m.from);
          const waiting = inbox ? waitingFor(m.date, m.answered, m.from.address, now) : null;
          return <li key={rowKey(m)}>
            <button type="button" className="mg-mail-row" data-unread={!m.seen || undefined} aria-current={selected === rowKey(m) || undefined} onClick={() => onOpen(m)}>
              <span className="mg-avatar" aria-hidden="true">{initials(sentFolder ? m.to[0]?.name ?? "" : m.from.name, sentFolder ? m.to[0]?.address ?? "" : m.from.address)}</span>
              <span className="mg-mail-row-text">
                <span className="mg-mail-row-top"><b>{sentFolder ? `To ${person}` : person}</b><time dateTime={m.date ?? undefined}>{listTime(m.date, now)}</time></span>
                <span className="mg-mail-row-subject">{!m.seen && <i className="mg-live-dot" aria-label="Unread" />}{m.subject}</span>
                <span className="mg-mail-row-meta">
                  {m.thread > 1 && <span className="mg-badge" aria-label={`${m.thread} messages`}>{m.thread}</span>}
                  {m.hasAttachments && <Paperclip size={13} aria-label="Has attachments" />}
                  {m.flagged && <Star size={13} weight="fill" className="mg-mail-star" aria-label="Starred" />}
                  {waiting && <span className="mg-mail-waiting" aria-label={`Waiting ${waiting} for a reply`}><Clock size={11} aria-hidden="true" />{waiting}</span>}
                </span>
              </span>
            </button>
          </li>;
        })}
      </ul>
    </section>)}
    {error && <p className="mg-mail-error" role="alert">{error}</p>}
    {hasMore && <button type="button" className="mg-pill mg-mail-more" onClick={onMore} disabled={loading}>{loading ? "Loading" : "Show older"}</button>}
  </div>;
}

function ListSkeleton() {
  return <div className="mg-mail-scroll" aria-busy="true" aria-label="Loading mail">
    {Array.from({ length: 6 }, (_, i) => <div key={i} className="mg-mail-skeleton"><span /><span /><span /></div>)}
  </div>;
}
