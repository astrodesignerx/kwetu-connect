"use client";
import type { MessageRow, MailAction } from "@/app/mail/actions";
import MailIcon from "./MailIcon";
import { conversationKey } from "@/lib/mail/kca";
import { dayGroup, initials, listTime, senderName, shortWhen, waitingFor } from "./mail-format";
export const rowKey = (m: Pick<MessageRow,"mailbox"|"uid"> & {accountId?:string}) => `${m.accountId ? m.accountId + ":" : ""}${m.mailbox}:${m.uid}`;
type Party = (m: MessageRow) => string;
const noParty: Party = () => "";
/** Which conversation a row belongs to: its mailbox, subject and other party. */
export const conversationOf = (m: MessageRow, party: Party = noParty) => `${(m as MessageRow & {accountId?:string}).accountId ?? ""}:${conversationKey(m.subject, party(m))}`;
/** One row per conversation: the first (newest) message of each. The list and J / K share it. */
export function threadRows<T extends MessageRow>(items: T[], party: Party = noParty): T[] {
  const seen = new Set<string>();
  return items.filter((m) => {
    const identity = conversationOf(m, party);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
export type GroupOptions = { inbox: boolean; waitingKeys?: Set<string>; party?: Party; returned?: (m: MessageRow) => boolean; now?: Date };
const FIRST = ["Back from snooze", "Needs your reply"];
/** The headed groups in the order the list shows them. J and K walk `listGroups(...).flatMap(([, rows]) => rows)`. */
export function listGroups<T extends MessageRow>(items: T[], { inbox, waitingKeys, party, returned, now = new Date() }: GroupOptions): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const m of threadRows(items, party)) {
    const g = inbox && returned?.(m) ? "Back from snooze" : inbox && waitingKeys ? waitingKeys.has(rowKey(m)) ? "Needs your reply" : "Other mail" : dayGroup(m.date, now);
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const rank = (g: string) => FIRST.includes(g) ? FIRST.indexOf(g) : FIRST.length;
  return [...groups].sort(([a], [b]) => rank(a) - rank(b));
}
export type RowMarks = { draft?: boolean; snoozedUntil?: string | null };
export default function MailList({items, selected, sentFolder, inbox, loading, error, hasMore, onOpen, onMore, onRetry, selectedKeys = [], onSelect, onAct, business, assignment, waitingKeys, empty, party, returned, marks, now: clock}: {
  items:MessageRow[]; selected:string|null; sentFolder:boolean; inbox:boolean; loading:boolean; error:string|null; hasMore:boolean;
  onOpen:(m:MessageRow)=>void; onMore:()=>void; onRetry:()=>void; selectedKeys?:string[]; onSelect?:(m:MessageRow,range:boolean)=>void; onAct?:(m:MessageRow,action:MailAction)=>void;
  business?:(m:MessageRow)=>string; assignment?:(m:MessageRow)=>string; waitingKeys?:Set<string>; empty?:{title:string;detail?:string};
  party?:Party; returned?:(m:MessageRow)=>boolean; marks?:(m:MessageRow)=>RowMarks; now?:number;
}) {
  if(error && !items.length) return <div className="empty-state" role="alert"><div><p>{error}</p><button type="button" className="btn line" onClick={onRetry}>Try again</button></div></div>;
  if(!items.length) return loading ? <div className="list-scroll" aria-label="Loading mail" aria-busy="true">{Array.from({length:6},(_,i)=><div key={i} className="mg-mail-skeleton"><span/><span/><span/></div>)}</div> : <div className="empty-state"><div><b>{empty?.title ?? "No conversations"}</b>{empty?.detail && <p>{empty.detail}</p>}</div></div>;
  const now=clock ? new Date(clock) : new Date(), ordered=listGroups(items,{inbox,waitingKeys,party,returned,now});
  return <div className="list-scroll" aria-busy={loading}>{ordered.map(([group,rows])=><section key={group} aria-label={group}><h3 className="group-h"><span>{group}</span><span className="mono">{rows.length}</span></h3>{rows.map((m)=>{
    const person=sentFolder ? m.to[0] ? senderName(m.to[0]) : "No recipient" : senderName(m.from), key=rowKey(m);
    const waiting=inbox && (!waitingKeys || waitingKeys.has(key)) ? waitingFor(m.date,m.answered,m.from.address,now) : null;
    const assigned = assignment?.(m);
    const client = business?.(m);
    const mark = marks?.(m) ?? {};
    const snippet = m.snippet?.trim();
    const recipients = [...m.to.map((recipient) => recipient.address), ...m.to.map(senderName)];
    const repeatsRecipient = snippet && [...recipients, m.to.map(senderName).join(", ")]
      .some((value) => value.trim().toLowerCase() === snippet.toLowerCase());
    return <div key={key} className={`row ${!m.seen ? "unread" : ""} ${selectedKeys.includes(key) ? "is-sel" : ""}`} data-unread={!m.seen||undefined} aria-current={selected===key}>
      <button type="button" className="av av-btn" aria-label={`Select ${m.subject}`} title="Select. Shift-click selects a range." aria-pressed={selectedKeys.includes(key)} onClick={(e)=>onSelect?.(m,e.shiftKey)}>{initials(sentFolder ? m.to[0]?.name ?? "" : m.from.name,sentFolder ? m.to[0]?.address ?? "" : m.from.address)}<span className="tick"><MailIcon name="check" size="xs"/></span></button>
      <button type="button" className="row-main" onClick={(e) => e.shiftKey && onSelect ? onSelect(m,true) : onOpen(m)} aria-label={`${person}, ${m.subject}${m.seen ? "" : ", unread"}${m.thread > 1 ? `, ${m.thread} messages` : ""}${mark.draft ? ", draft saved" : ""}`}>
        <span className="row-top">
          {!m.seen && <i className="udot" aria-hidden="true" />}
          <span className="row-from">{sentFolder ? `To ${person}` : person}</span>
          <time className="row-time mono" dateTime={m.date ?? undefined}>{listTime(m.date, now)}</time>
        </span>
        <span className="row-subj">{m.subject} {m.hasAttachments && <MailIcon name="clip" size="xs" />}</span>
        {snippet && !repeatsRecipient && <span className="row-snip">{snippet}</span>}
        {(client || m.thread > 1 || m.flagged || waiting || assigned || mark.draft || mark.snoozedUntil) && <span className="row-foot">
          {client && <span className="row-biz">{client}</span>}
          {mark.draft && <span className="pill info">Draft</span>}
          {mark.snoozedUntil && <span className="pill mute" aria-label={`Snoozed until ${shortWhen(mark.snoozedUntil)}`}><MailIcon name="snooze" size="xs" />{shortWhen(mark.snoozedUntil)}</span>}
          {m.thread > 1 && <span className="pill mute" aria-hidden="true">{m.thread}</span>}
          {m.flagged && <span className="pill gold" aria-label="Starred"><MailIcon name="star" size="xs" /></span>}
          {waiting && <span className="pill ember" aria-label={`Waiting ${waiting} for a reply`}><MailIcon name="clock" size="xs" />{waiting}</span>}
          {assigned && <span className="assigned-avatar" title={assigned}>{initials(assigned, assigned)}</span>}
        </span>}
      </button>
      {onAct&&<div className="row-tools" role="group" aria-label="Quick actions">{([["archive","Archive"],[m.flagged ? "unstar" : "star",m.flagged ? "Remove star" : "Star"],["unread","Mark unread"]] as [MailAction,string][]).map(([action,label])=><button key={action} type="button" aria-label={`${label}: ${m.subject}`} onClick={()=>onAct(m,action)}><MailIcon name={action==="unstar" ? "star" : action} size="sm"/></button>)}</div>}
    </div>;
  })}</section>)}{error&&<p className="alert" role="alert">{error}</p>}{hasMore&&<button type="button" className="btn line mail-more" onClick={onMore} disabled={loading}>{loading ? "Loading" : "Show older"}</button>}</div>;
}
