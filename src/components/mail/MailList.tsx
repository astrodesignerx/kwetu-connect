"use client";
import type { MessageRow, MailAction } from "@/app/mail/actions";
import MailIcon from "./MailIcon";
import { dayGroup, initials, listTime, senderName, waitingFor } from "./mail-format";
export const rowKey = (m: Pick<MessageRow,"mailbox"|"uid"> & {accountId?:string}) => `${m.accountId ? m.accountId + ":" : ""}${m.mailbox}:${m.uid}`;
export default function MailList({items, selected, sentFolder, inbox, loading, error, hasMore, onOpen, onMore, onRetry, selectedKeys = [], onSelect, onAct, business, assignment, waitingKeys}: {
  items:MessageRow[]; selected:string|null; sentFolder:boolean; inbox:boolean; loading:boolean; error:string|null; hasMore:boolean;
  onOpen:(m:MessageRow)=>void; onMore:()=>void; onRetry:()=>void; selectedKeys?:string[]; onSelect?:(m:MessageRow)=>void; onAct?:(m:MessageRow,action:MailAction)=>void;
  business?:(m:MessageRow)=>string; assignment?:(m:MessageRow)=>string; waitingKeys?:Set<string>;
}) {
  if(error && !items.length) return <div className="empty-state" role="alert"><div><p>{error}</p><button type="button" className="btn line" onClick={onRetry}>Try again</button></div></div>;
  if(!items.length) return loading ? <div className="list-scroll" aria-label="Loading mail" aria-busy="true">{Array.from({length:6},(_,i)=><div key={i} className="mg-mail-skeleton"><span/><span/><span/></div>)}</div> : <div className="empty-state"><div><b>No conversations</b></div></div>;
  const now=new Date(), groups=new Map<string,MessageRow[]>(), seen=new Set<string>();
  for(const m of items) {
    const identity = `${(m as MessageRow & {accountId?:string}).accountId ?? ""}:${m.subject.replace(/^(?:(?:re|fw|fwd):\s*)+/ig,"").trim().toLowerCase()}`;
    if(seen.has(identity)) continue; seen.add(identity);
    const g=inbox && waitingKeys ? waitingKeys.has(rowKey(m)) ? "Needs your reply" : "Other mail" : dayGroup(m.date,now);
    groups.set(g,[...(groups.get(g)??[]),m]);
  }
  const ordered = [...groups].sort(([a],[b]) => a === "Needs your reply" ? -1 : b === "Needs your reply" ? 1 : 0);
  return <div className="list-scroll" aria-busy={loading}>{ordered.map(([group,rows])=><section key={group} aria-label={group}><h3 className="group-h"><span>{group}</span><span className="mono">{rows.length}</span></h3>{rows.map((m)=>{
    const person=sentFolder ? m.to[0] ? senderName(m.to[0]) : "No recipient" : senderName(m.from), key=rowKey(m);
    const waiting=inbox && (!waitingKeys || waitingKeys.has(key)) ? waitingFor(m.date,m.answered,m.from.address,now) : null;
    const assigned = assignment?.(m);
    const client = business?.(m);
    const snippet = m.snippet?.trim();
    const recipients = [...m.to.map((recipient) => recipient.address), ...m.to.map(senderName)];
    const repeatsRecipient = snippet && [...recipients, m.to.map(senderName).join(", ")]
      .some((value) => value.trim().toLowerCase() === snippet.toLowerCase());
    return <div key={key} className={`row ${!m.seen ? "unread" : ""} ${selectedKeys.includes(key) ? "is-sel" : ""}`} data-unread={!m.seen||undefined} aria-current={selected===key}>
      <button type="button" className="av av-btn" aria-label={`Select ${m.subject}`} aria-pressed={selectedKeys.includes(key)} onClick={()=>onSelect?.(m)}>{initials(sentFolder ? m.to[0]?.name ?? "" : m.from.name,sentFolder ? m.to[0]?.address ?? "" : m.from.address)}<span className="tick"><MailIcon name="check" size="xs"/></span></button>
      <button type="button" className="row-main" onClick={() => onOpen(m)} aria-label={`${person}, ${m.subject}${m.seen ? "" : ", unread"}${m.thread > 1 ? `, ${m.thread} messages` : ""}`}>
        <span className="row-top">
          {!m.seen && <i className="udot" aria-hidden="true" />}
          <span className="row-from">{sentFolder ? `To ${person}` : person}</span>
          <time className="row-time mono" dateTime={m.date ?? undefined}>{listTime(m.date, now)}</time>
        </span>
        <span className="row-subj">{m.subject} {m.hasAttachments && <MailIcon name="clip" size="xs" />}</span>
        {snippet && !repeatsRecipient && <span className="row-snip">{snippet}</span>}
        {(client || m.thread > 1 || m.flagged || waiting || assigned) && <span className="row-foot">
          {client && <span className="row-biz">{client}</span>}
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
