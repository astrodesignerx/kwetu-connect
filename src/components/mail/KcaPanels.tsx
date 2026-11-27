"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MailDirectory, Booking } from "@/lib/store/types";
import { advertState, bookingHref, clientsFrom, managerAction, managerBrief, matchIndex, metaFor, type Client, type Match } from "@/lib/mail/kca";
import { liveProgress } from "@/lib/booking/pipeline";
import { scheduleLines } from "@/lib/booking/selection";
import { mailAssign, mailClientConversations, mailFollowUps, mailLinkClient, mailSaveNote, mailSaveTemplate, mailDeleteTemplate, mailWaiting, mailWorkspace } from "@/app/mail/kca-actions";
import type { ConversationRow } from "@/lib/mail/conversations";
import type { ClientNote, Template } from "@/lib/mail/kca-data";
import { mailRequest } from "./mail-request";
import { avatarTone, bookingDates, briefDate, dayTile, fullTime, initials, listTime, money, number, stageLabel, stageTone, waitingFor } from "./mail-format";
import MailIcon from "./MailIcon";
import QuickQuote from "./QuickQuote";
import BookingHero from "./BookingHero";
import { useConfirm } from "./MailOverlay";
import { Motion } from "./motion";
export { money } from "./mail-format";
export type Workspace = Extract<Awaited<ReturnType<typeof mailWorkspace>>, {ok:true}>["data"];
export type WaitingResult = Awaited<ReturnType<typeof mailWaiting>>;
export type FollowUpResult = Awaited<ReturnType<typeof mailFollowUps>>;
/** Links mail from an address that is not on any booking to a booking client, or removes that link. */
function ClientLinker({ sender, workspace: w, linked, onUpdated }: { sender: string; workspace: Workspace; linked?: boolean; onUpdated: () => void }) {
  const [clientId, setClientId] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const clients = useMemo(() => w.directory ? clientsFrom(w.directory, w.links) : [], [w.directory, w.links]);
  const save = async (id: string | null) => {
    setBusy(true); setMessage("");
    const r = await mailRequest(mailLinkClient(sender, id));
    setBusy(false);
    if (r.ok) { setMessage(id ? "Linked. Mail from this address now shows the client." : "Link removed"); onUpdated(); } else setMessage(r.error);
  };
  // Nothing to link to until bookings have clients.
  if (!linked && !clients.length) return null;
  if (linked) return <div className="link-client"><small className="muted">{sender} is linked to this client by hand.</small><button type="button" className="link" disabled={busy} onClick={() => void save(null)}>Unlink</button>{message && <p role="status">{message}</p>}</div>;
  return <form className="link-client" onSubmit={(e) => { e.preventDefault(); if (clientId) void save(clientId); }}>
    <label>Link {sender} to a client<select value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={busy}><option value="">Choose a client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.advertiser.business}</option>)}</select></label>
    <button className="btn line sm" disabled={busy || !clientId}>Link</button>{message && <p role="status">{message}</p>}
  </form>;
}
export function BookingCard({booking:b,data,today}:{booking:Booking;data:MailDirectory;today:string}) {
  const action=managerAction(data,b),run=liveProgress(b,today);
  return <section className="booking-card"><div className="bk-head"><a className="mono link" href={bookingHref(b)}>{b.reference}</a><span className={`pill stage ${stageTone(b.status)}`}>{stageLabel(b.status)}</span></div><dl className="kv"><dt>Price</dt><dd className="booking-price mono">{money(b.priceKes)}</dd><dt>Dates</dt><dd>{bookingDates(b.request.startDate,b.request.endDate)}</dd><dt>Plan</dt><dd>{number(b.request.lengthSeconds)} s | {number(b.request.howOften)} plays an hour<br/>{scheduleLines(b.request,data.settings.timeBlocks).join(" / ")}</dd><dt>Plays</dt><dd className="mono">{number(b.plays)}</dd><dt>Advert</dt><dd>{advertState(data,b)}</dd></dl>{b.status==="Live"&&<div className="run"><div className="run-bar"><i style={{width:`${Math.min(100,run.day/run.total*100)}%`}}/></div><div className="run-txt"><span>Planned run</span><span className="mono">Day {run.day} of {run.total}</span></div></div>}<a className="link" href={action.href}>{action.label}<MailIcon name="ext" size="xs"/></a></section>;
}
export function NoteEditor({email,note,onSaved,sticky=false}:{email:string;note?:ClientNote;onSaved:(note:ClientNote)=>void;sticky?:boolean}) {
  const [value,setValue]=useState(note?.note??""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  return <form className={`mail-note-editor ${sticky ? "notecard" : ""}`} onSubmit={async(e)=>{e.preventDefault();setBusy(true);const r=await mailRequest(mailSaveNote(email,value));setBusy(false);if(r.ok){onSaved(r.data);setMessage("Note saved");}else setMessage(r.error);}}>
    <label>{!sticky && "Team note"}<textarea aria-label="Client note" placeholder="Add a note for the team..." maxLength={10000} rows={sticky ? 4 : 3} value={value} onChange={(e)=>setValue(e.target.value)}/></label>
    <div className="note-foot">
      {note ? <small>Updated {fullTime(note.updated_at)}{note.updated_by ? ` by ${note.updated_by}` : ""}</small> : <small>Visible only to Kwetu Connect staff</small>}
      <button className="btn line sm" disabled={busy}>Save note</button>
    </div>
    {message&&<p role="status">{message}</p>}
  </form>;
}
export function Inspector({match,workspace:w,accountId,subject,party="",onClient,onReplyText,onUpdated,onNote,onClose,booking=true}:{match:Match;workspace:Workspace;accountId:string;subject:string;party?:string;booking?:boolean;onClient:(id:string)=>void;onReplyText:(text:string)=>void;onUpdated:()=>void;onNote:(note:ClientNote)=>void;onClose?:()=>void}) {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),assigned=metaFor(w.meta,subject,party)?.assigned_email;
  return <aside className="panel insp" aria-label="Client and booking"><div className="insp-scroll"><section className="insp-sec"><div className="insp-h"><MailIcon name="clients"/><h3>Client</h3>{onClose&&<button type="button" className="btn ghost icon insp-close" onClick={onClose} aria-label="Close inspector"><MailIcon name="x" size="sm"/></button>}</div>{match.client?<><div className="client-line"><span className="av" data-tone={avatarTone(match.client.advertiser.business)}>{initials(match.client.advertiser.business,"")}</span><div><b>{match.client.advertiser.business}</b><span>{match.client.advertiser.name} | {match.client.advertiser.phone}</span></div></div><button type="button" className="link" onClick={()=>onClient(match.client!.id)}>Open client<MailIcon name="right" size="xs"/></button>{match.by && !match.booking && <small className="muted">Matched by {match.by === "reference" ? "booking reference" : "email address"}</small>}{party && match.client.linked?.includes(party) && <ClientLinker sender={party} workspace={w} linked onUpdated={onUpdated} />}</>:<><p className="muted">{w.directory?match.unknownReference?`No booking matches ${match.unknownReference}.`:"No matching client or booking.":"Booking lookup is unavailable. Mail is still available."}</p>{w.directory && party && !match.unknownReference && <ClientLinker key={party} sender={party} workspace={w} onUpdated={onUpdated} />}</>}</section>
    {booking&&match.booking&&w.directory&&<section className="insp-sec"><div className="insp-h"><MailIcon name="calendar"/><h3>Booking</h3></div><BookingCard booking={match.booking} data={w.directory} today={w.today}/>{match.by && <small className="muted">Matched by {match.by === "reference" ? "booking reference" : "email address"}</small>}</section>}
    {w.directory&&!match.booking&&<section className="insp-sec"><QuickQuote settings={w.directory.settings} today={w.today} onInsert={onReplyText}/></section>}
    <section className="insp-sec"><div className="insp-h"><MailIcon name="assigned"/><h3>Team</h3></div><label className="team-assignment">Assigned to<select aria-label="Assign conversation" value={assigned??""} disabled={busy||!w.people.length} onChange={async(e)=>{const email=e.target.value;setBusy(true);const r=await mailRequest(mailAssign(accountId,subject,email||null,party));setBusy(false);if(r.ok){onUpdated();setMessage(email?"Assignment saved":"Unassigned");}else setMessage(r.error);}}><option value="">{assigned ? "Unassign" : "Unassigned"}</option>{w.people.map((p)=><option key={p.email} value={p.email}>{p.name}{p.email===w.me?" (you)":""}</option>)}</select></label>{!w.people.length&&<p className="muted">Team access could not be loaded. Refresh to try again.</p>}{message&&<p role="status">{message}</p>}{match.client?.emails[0]&&<NoteEditor key={match.client.emails[0]} email={match.client.emails[0]} note={w.notes.find((n)=>n.advertiser_email===match.client!.emails[0])} onSaved={onNote} sticky/>}</section>
    {!!w.templates.length&&<section className="insp-sec"><div className="insp-h"><MailIcon name="templates"/><h3>Quick replies</h3></div><div className="qr-list">{w.templates.map((t)=><button type="button" key={t.id} onClick={()=>onReplyText(t.body)}>{t.name}<MailIcon name="enter" size="xs"/></button>)}</div></section>}
  </div></aside>;
}

/** Greeting for the hour in Nairobi, so the brief does not say good morning at 4pm. */
function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
const ADVERT_LABEL: Record<ReturnType<typeof advertState>, string> = {
  approved: "Advert approved",
  waiting: "Advert waiting",
  refused: "Advert needs changes",
  none: "No advert yet",
};

export function MorningBrief({workspace:w,waiting,followUps,unread,onOpen,full=false,onGo,mailboxCount=1,me="",headerStart,onSearchPalette}:{
  workspace:Workspace|null; waiting:WaitingResult|null; followUps?:FollowUpResult|null; unread:number;
  onOpen:(row:ConversationRow,reply?:boolean)=>void; full?:boolean; onGo?:(view:string,filter?:string)=>void;
  mailboxCount?:number; me?:string; headerStart?:ReactNode; onSearchPalette?:()=>void;
}) {
  const data=w?.directory, manager=data&&managerBrief(data,w.today), match=data?matchIndex(data,w.links):null;
  const rows=waiting?.ok?waiting.data.items:[], quiet=followUps?.ok?followUps.data.items:[];
  const oldestWait = rows[0] ? waitingFor(rows[0].date, false, rows[0].from.address) : null;
  const startKes = manager ? manager.next.reduce((sum, b) => sum + b.priceKes, 0) : 0;
  const staffName = w?.people.find((p) => p.email.toLowerCase() === (me || w.me).toLowerCase())?.name.split(" ")[0] || "";
  const summaryLine = rows.length
    ? `${rows.length === 1 ? "1 conversation is" : `${number(rows.length)} conversations are`} waiting on you.${oldestWait ? ` Oldest waited ${oldestWait}.` : ""}`
    : "You are caught up on every client reply.";
  return <div className={`brief-shell ${full ? "brief-full" : ""}`}>
    {full && <header className="view-head">
      {headerStart}
      <h1>Today <small>{briefDate(w?.today ?? new Date())}</small></h1>
      <span className="vh-sp" />
      {onSearchPalette && <button type="button" className="vsearch" onClick={onSearchPalette} aria-label="Search mail, clients and bookings"><MailIcon name="search" size="xs" /><span>Search mail, clients, bookings</span><kbd>/</kbd></button>}
    </header>}
    <div className="main-scroll"><section className="brief">
      <div className="brief-head">
        <div>
          <h2>{full && staffName ? `${greeting()}, ${staffName}` : "Morning brief"}</h2>
          {full ? <p className="brief-lede">{summaryLine}</p> : <span className="brief-date mono">{briefDate(w?.today??new Date())}</span>}
        </div>
        {full && onGo && <button type="button" className="btn gold" onClick={() => onGo("Inbox")}><MailIcon name="inbox" size="sm" />Open the inbox</button>}
      </div>
      <div className="brief-stats">
        <button type="button" className="brief-stat hot" onClick={() => onGo?.("Inbox", "waiting")}>
          <b>{number(rows.length)}</b>
          <span>Waiting on you{waiting?.ok && waiting.data.partial ? " (partial)" : ""}</span>
          <small>{oldestWait ? `oldest ${oldestWait}` : "all caught up"}</small>
        </button>
        <button type="button" className="brief-stat" onClick={() => onGo?.("Inbox", "unread")}>
          <b>{number(unread)}</b>
          <span>Unread</span>
          <small>{mailboxCount > 1 ? `across ${mailboxCount} mailboxes` : "in this mailbox"}</small>
        </button>
        <button type="button" className="brief-stat" onClick={() => quiet[0] ? onOpen(quiet[0]) : onGo?.("Sent")}>
          <b>{number(quiet.length)}</b>
          <span>No reply yet</span>
          <small>{quiet[0] ? (quiet[0].to[0]?.name || quiet[0].to[0]?.address || "Follow up") : "none pending"}</small>
        </button>
        <button type="button" className="brief-stat" onClick={() => onGo?.("Clients")}>
          <b>{number(manager?.next.length ?? 0)}</b>
          <span>Start this week</span>
          <small>{startKes ? `${money(startKes)} booked` : "next 7 days"}</small>
        </button>
      </div>
      {!waiting&&<p className="muted">Checking conversations</p>}{waiting&&!waiting.ok&&<p className="alert" role="alert">{waiting.error}</p>}{waiting?.ok&&waiting.data.errors.map((error)=><p className="alert" role="alert" key={error}>{error}</p>)}
      <div className="brief-grid">
        <div className="brief-col">
          <div className="sec-h"><MailIcon name="hourglass" size="sm" />Waiting on you, oldest first<small>Reply clears it</small></div>
          <article className="card brief-panel">
            {rows.length ? rows.map((r)=>{
              const client=match?.({subject:r.subject,addresses:[r.from.address,...r.to.map((a)=>a.address)]}).client;
              const label = client?.advertiser.business || r.from.name || r.from.address;
              return <div className="wait-row" key={`${r.accountId}:${r.mailbox}:${r.uid}`}>
                <span className="av" data-tone={avatarTone(label)}>{initials(client?.advertiser.business || r.from.name, r.from.address)}</span>
                <button type="button" className="wait-main" onClick={()=>onOpen(r)}>
                  <b>{r.from.name||r.from.address}{client?` | ${client.advertiser.business}`:""}</b>
                  <span>{r.subject}</span>
                </button>
                <div className="wait-end">
                  <span className="pill ember mono">{waitingFor(r.date,false,r.from.address)||listTime(r.date)}</span>
                  <button type="button" className="btn line sm reply-hint" onClick={()=>onOpen(r,true)}><MailIcon name="reply" size="xs"/>Reply</button>
                </div>
              </div>;
            }) : <p className="brief-empty">Nobody is waiting on a reply right now.</p>}
          </article>
          {!!quiet.length && <>
            <div className="sec-h"><MailIcon name="sent" size="sm" />Sent, no reply yet</div>
            <article className="card brief-panel">
              {quiet.map((r)=>{
                const to=r.to[0]??{name:"",address:""};
                return <div className="wait-row" key={`${r.accountId}:${r.mailbox}:${r.uid}`}>
                  <span className="av" data-tone={avatarTone(to.name || to.address)}>{initials(to.name,to.address)}</span>
                  <button type="button" className="wait-main" onClick={()=>onOpen(r)}><b>{to.name||to.address}</b><span>{r.subject}</span></button>
                  <div className="wait-end"><span className="pill info mono">Sent {listTime(r.date)}</span><button type="button" className="btn line sm reply-hint" onClick={()=>onOpen(r,true)}><MailIcon name="reply" size="xs"/>Follow up</button></div>
                </div>;
              })}
            </article>
          </>}
        </div>
        <div className="brief-col">
          {manager&&data&&!!manager.next.length&&<>
            <div className="sec-h"><MailIcon name="calendar" size="sm" />Starting this week</div>
            <article className="card brief-panel">
              {manager.next.map((b)=>{
                const tile = dayTile(b.request.startDate);
                return <a className="golive" key={b.id} href={bookingHref(b)}>
                  <span className="date-tile"><b>{tile.day}</b><small>{tile.month}</small></span>
                  <div><b>{data.advertisers.find((a)=>a.id===b.advertiserId)?.business||b.reference}</b><span>{number(b.request.lengthSeconds)} s, {ADVERT_LABEL[advertState(data,b)]}</span></div>
                  <span className={`pill stage ${stageTone(b.status)}`}>{stageLabel(b.status)}</span>
                </a>;
              })}
            </article>
          </>}
          {manager&&data&&!!(manager.review.length+manager.payment.length+manager.live.length)&&<>
            <div className="sec-h"><MailIcon name="coins" size="sm" />From the manager<a href="/manage" className="link">Open<MailIcon name="ext" size="xs"/></a></div>
            <article className="card brief-panel">
              {([["Adverts to review","advert to review",manager.review,"play","gold","/manage/adverts"],["Quotes awaiting payment","quote awaiting payment",manager.payment,"coins","ember","/manage/bookings"],["Bookings planned live today","booking planned live today",manager.live,"screen","ok","/manage/schedule"]] as const).filter(([,,items])=>items.length).map(([title,one,items,icon,colour,href])=>(
                <div className="mgr-item" key={title}>
                  <span className={`mgr-ic ${colour}`}><MailIcon name={icon} size="sm"/></span>
                  <div><b>{number(items.length)} {items.length === 1 ? one : title.toLowerCase()}</b><span>{items.slice(0,2).map((b)=>data.advertisers.find((a)=>a.id===b.advertiserId)?.business||b.reference).join(", ")}</span></div>
                  <a href={href} className="btn line sm">Open</a>
                </div>
              ))}
            </article>
          </>}
        </div>
      </div>
      {w?.errors.map((error)=><p className="alert" role="alert" key={error}>{error}</p>)}
    </section></div>
  </div>;
}

type ClientFilter = "all" | "active" | "live" | "quote";
export function ClientsView({workspace:w,clientId,onClient,onNew,onOpen,onNote,headerStart,onSearchPalette}:{
  workspace:Workspace; clientId:string; onClient:(id:string)=>void; onNew:(email:string)=>void; onOpen:(row:ConversationRow)=>void; onNote:(note:ClientNote)=>void;
  headerStart?:ReactNode; onSearchPalette?:()=>void;
}) {
  const [search,setSearch]=useState(""), [statusFilter, setStatusFilter] = useState<ClientFilter>("all");
  const clients=useMemo(()=>w.directory?clientsFrom(w.directory,w.links):[],[w.directory,w.links]);
  const filtered = useMemo(() => clients.filter((c) => {
    const latest = c.bookings.find((b) => !["Finished", "Cancelled"].includes(b.status)) ?? c.bookings[0];
    if (statusFilter === "active" && (!latest || ["Finished", "Cancelled"].includes(latest.status))) return false;
    if (statusFilter === "live" && latest?.status !== "Live") return false;
    if (statusFilter === "quote" && latest?.status !== "Quote") return false;
    if (!search.trim()) return true;
    return `${c.advertiser.business} ${c.advertiser.name} ${c.emails.join(" ")} ${c.bookings.map((b)=>b.reference).join(" ")}`.toLowerCase().includes(search.toLowerCase());
  }), [clients, search, statusFilter]);
  const client = filtered.find((c)=>c.id===clientId) ?? clients.find((c)=>c.id===clientId) ?? filtered[0] ?? clients[0];
  return <div className="split-view">
    <header className="view-head">
      {headerStart}
      <h1>Clients <small>{filtered.length === clients.length ? `${clients.length} total` : `${filtered.length} of ${clients.length}`}</small></h1>
      <span className="vh-sp" />
      {onSearchPalette && <button type="button" className="vsearch" onClick={onSearchPalette} aria-label="Search mail, clients and bookings"><MailIcon name="search" size="xs" /><span>Search mail, clients, bookings</span><kbd>/</kbd></button>}
    </header>
    <div className="cl-wrap" data-view={clientId?"detail":"list"}>
      <section className="panel list" aria-label="Clients">
        <div className="list-head">
          <label className="search-in"><MailIcon name="search" size="sm"/><span className="sr">Search clients</span><input type="search" placeholder="Find a client or KCA reference" value={search} onChange={(e)=>setSearch(e.target.value)}/></label>
          <div className="client-seg" role="group" aria-label="Client filter">
            {([["all","All"],["active","Active"],["live","On air"],["quote","Quotes"]] as const).map(([k,l]) => (
              <button type="button" key={k} aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="list-scroll">{!w.directory?<p className="empty-state">Clients could not be loaded. Try Refresh.</p>:!filtered.length?<p className="empty-state">{clients.length ? "No clients match this filter." : "No advertisers in bookings yet."}</p>:filtered.map((c)=>{
          const top = c.bookings.find((b) => !["Finished", "Cancelled"].includes(b.status)) ?? c.bookings[0];
          const totalKes = c.bookings.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + b.priceKes, 0);
          return <button type="button" className="cl-row" key={c.id} aria-current={c.id===client?.id} onClick={()=>onClient(c.id)}>
            <span className="av" data-tone={avatarTone(c.advertiser.business)}>{initials(c.advertiser.business,"")}</span>
            <span className="cl-main"><b>{c.advertiser.business}</b><span>{c.advertiser.name}</span></span>
            <span className="cl-end">{top && <><span className={`pill stage ${stageTone(top.status)}`}>{stageLabel(top.status)}</span><small className="mono">{money(totalKes || top.priceKes)}</small></>}</span>
          </button>;
        })}</div>
      </section>
      <section className="panel main">{client&&w.directory?<Motion key={client.id} enter={{"mail-open":"mail-open",default:"none"}} exit={{"mail-open":"mail-open-out",default:"none"}} default="none"><ClientDetail client={client} workspace={w} onBack={()=>onClient("")} onNew={onNew} onOpen={onOpen} onNote={onNote}/></Motion>:<div className="empty-state">Choose a client.</div>}</section>
    </div>
  </div>;
}

function ClientDetail({client:c,workspace:w,onBack,onNew,onOpen,onNote}:{client:Client;workspace:Workspace;onBack:()=>void;onNew:(email:string)=>void;onOpen:(row:ConversationRow)=>void;onNote:(note:ClientNote)=>void}) {
  const [conversations,setConversations]=useState<Awaited<ReturnType<typeof mailClientConversations>>|null>(null),emails=c.emails.join(",");
  useEffect(()=>{let live=true;if(emails)void mailRequest(mailClientConversations(emails.split(","))).then((r)=>{if(live)setConversations(r);});return()=>{live=false;};},[emails]);
  const current=c.bookings.find((b)=>!["Finished","Cancelled"].includes(b.status))??c.bookings[0];
  const bookedTotal = c.bookings.filter((b)=>b.status!=="Cancelled").reduce((s,b)=>s+b.priceKes,0);
  return <div className="main-scroll"><div className="cl-detail">
    <button type="button" className="btn ghost sm back-btn" onClick={onBack}><MailIcon name="left" size="xs" />All clients</button>
    <div className="cl-top">
      <span className="av" data-tone={avatarTone(c.advertiser.business)}>{initials(c.advertiser.business,"")}</span>
      <div>
        <h2>{c.advertiser.business}</h2>
        <p>{c.advertiser.name}{c.advertiser.phone ? `, ${c.advertiser.phone}` : ""}{c.emails[0] ? `, ${c.emails[0]}` : ""}</p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn line sm" disabled={!emails} onClick={()=>onNew(c.emails[0])}><MailIcon name="unread" size="xs"/>Email</button>
        {c.bookings[0]&&<a className="btn gold sm" href={bookingHref(c.bookings[0])}><MailIcon name="ext" size="xs"/>Open in manager</a>}
      </div>
    </div>
    <dl className="kpis">
      <div><dt>Bookings</dt><dd>{number(c.bookings.length)}</dd></div>
      <div><dt>Booked total</dt><dd className="mono">{money(bookedTotal)}</dd></div>
      <div><dt>Client since</dt><dd>{bookingDates(c.advertiser.createdAt.slice(0,10))}</dd></div>
      <div><dt>Status</dt><dd>{current ? <span className={`pill stage ${stageTone(current.status)}`}>{stageLabel(current.status)}</span> : "Lead"}</dd></div>
    </dl>
    {current&&<section className="cl-current" aria-label="Current booking">
      <div className="sec-h"><MailIcon name="screen" size="sm" />{["Finished","Cancelled"].includes(current.status)?"Latest booking":"Current booking"}</div>
      <BookingHero booking={current} client={c} data={w.directory!} today={w.today}/>
    </section>}
    <div className="sec-h"><MailIcon name="calendar" size="sm" />Bookings<small>Newest first</small></div>
    <article className="card tbl-panel">
      <table className="tbl">
        <thead><tr><th>Reference</th><th>Dates</th><th className="hide-sm">Plan</th><th className="num">KES</th><th>Stage</th></tr></thead>
        <tbody>{c.bookings.map((b) => (
          <tr key={b.id}>
            <td className="mono ref-cell"><a href={bookingHref(b)} className="link mono">{b.reference}</a></td>
            <td>{bookingDates(b.request.startDate, b.request.endDate)}</td>
            <td className="hide-sm muted">{number(b.request.lengthSeconds)} s, {number(b.request.howOften)}/hr</td>
            <td className="num">{number(b.priceKes)}</td>
            <td><span className={`pill stage ${stageTone(b.status)}`}>{stageLabel(b.status)}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </article>
    <div className="two">
      <div>
        <div className="sec-h"><MailIcon name="note" size="sm" />Team note</div>
        {emails ? <NoteEditor key={c.emails[0]} email={c.emails[0]} note={w.notes.find((n)=>n.advertiser_email===c.emails[0])} onSaved={onNote} sticky/> : <p className="muted">No email on file for notes.</p>}
      </div>
      <div>
        <div className="sec-h"><MailIcon name="unread" size="sm" />Addresses</div>
        <article className="card addr-panel">
          {c.emails.length ? c.emails.map((addr) => (
            <div className="addr-row" key={addr}>
              <span className="mono">{addr}</span>
              <small>{c.linked?.includes(addr) ? "Linked by hand" : "From bookings"}</small>
            </div>
          )) : <p className="brief-empty">No email on file.</p>}
        </article>
      </div>
    </div>
    <div className="sec-h"><MailIcon name="message" size="sm" />Recent conversations<small>{conversations?.ok ? `${conversations.data.items.length} found` : ""}</small></div>
    <article className="card brief-panel">
      {!emails?<p className="brief-empty">No email on file to match.</p>:!conversations?<p className="brief-empty">Loading conversations...</p>:!conversations.ok?<p role="alert" className="alert">{conversations.error}</p>:<>{conversations.data.errors.map((error)=><p key={error} role="alert" className="alert">{error}</p>)}{conversations.data.partial&&<p className="muted" style={{padding:"8px 16px"}}>Partial results, up to 300 messages per folder.</p>}{!conversations.data.items.length&&<p className="brief-empty">No matching conversations.</p>}{conversations.data.items.map((r)=><div className="wait-row" key={`${r.accountId}:${r.mailbox}:${r.uid}`}><span className="av" data-tone={avatarTone(r.from.name || r.from.address)}>{initials(r.from.name,r.from.address)}</span><button type="button" className="wait-main" onClick={()=>onOpen(r)}><b>{r.subject}</b><span>{r.from.name || r.from.address}</span></button><div className="wait-end"><span className="mono muted" style={{fontSize:"12px"}}>{listTime(r.date)}</span><button type="button" className="btn line sm" onClick={()=>onOpen(r)}>Open</button></div></div>)}</>}
    </article>
  </div></div>;
}

function TemplateEditor({ active, adding, count, onSaved, onDeleted, onCancel }: {
  active: Template | null; adding: boolean; count: number;
  onSaved: () => void; onDeleted: (id: string) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(active?.name ?? "");
  const [body, setBody] = useState(active?.body ?? "");
  const [order, setOrder] = useState(active?.sort_order ?? count);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDialog, ask] = useConfirm();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage("");
    const r = await mailRequest(mailSaveTemplate({ id: active?.id, name, body, sort_order: Number(order) }));
    setBusy(false);
    if (r.ok) { onSaved(); setMessage("Template saved"); } else setMessage(r.error);
  }

  async function remove() {
    if (!active) return;
    if (!await ask({ title: `Delete “${active.name}”?`, text: "This quick reply will be removed for everyone on the team.", action: "Delete template" })) return;
    setBusy(true); setMessage("");
    const r = await mailRequest(mailDeleteTemplate(active.id));
    setBusy(false);
    if (r.ok) { onDeleted(active.id); } else setMessage(r.error);
  }

  return <>
    <div className="tpl-editor">
      <form className="tpl-form" onSubmit={save}>
        <label className="field"><span>Name</span><input name="name" required maxLength={100} placeholder="e.g. Send quote" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Sort order</span><input name="order" type="number" step={1} required min={-100000} max={100000} value={order} onChange={(e) => setOrder(Number(e.target.value))} /><small className="muted">Shared with staff. Lower numbers appear first.</small></label>
        <label className="field"><span>Text</span><textarea name="body" required rows={9} maxLength={10000} placeholder="Write the quick reply text..." value={body} onChange={(e) => setBody(e.target.value)} /><small className="muted">Shown as a one-click quick reply under every conversation.</small></label>
        <div className="btn-row">
          <button type="submit" className="btn gold" disabled={busy}><MailIcon name="check" size="xs" />{adding ? "Create template" : "Save"}</button>
          {active && <button type="button" className="btn line bad-btn" disabled={busy} onClick={() => void remove()}><MailIcon name="trash" size="xs" />Delete</button>}
          {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        </div>
        {message && <p className="tpl-status" role="status">{message}</p>}
      </form>
      <div className="tpl-preview-col">
        <div className="sec-h" style={{ marginTop: 0 }}><MailIcon name="eye" size="sm" />How it looks in a reply</div>
        <div className="tpl-preview">
          <div className="tpl-bub-h"><b>You</b><span>to client</span></div>
          <div className="tpl-bub-b">{body.trim() || "Start typing on the left to preview your quick reply."}</div>
        </div>
      </div>
    </div>
    {confirmDialog}
  </>;
}

export function TemplatesView({templates,onUpdated,headerStart,onSearchPalette}:{templates:Template[];onUpdated:()=>void;headerStart?:ReactNode;onSearchPalette?:()=>void}) {
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(templates[0]?.id ?? null);
  const [adding, setAdding] = useState(templates.length === 0);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? templates.filter((t) => `${t.name} ${t.body}`.toLowerCase().includes(q)) : templates;
  }, [templates, search]);

  const active = adding ? null : (templates.find((t) => t.id === pickedId) ?? templates[0] ?? null);
  const startNew = () => { setAdding(true); setPickedId(null); setPhoneOpen(true); };
  const pick = (t: Template) => { setAdding(false); setPickedId(t.id); setPhoneOpen(true); };

  return <div className="split-view">
    <header className="view-head">
      {headerStart}
      <h1>Templates <small>{templates.length} quick {templates.length === 1 ? "reply" : "replies"}</small></h1>
      <span className="vh-sp" />
      <button type="button" className="btn line sm" onClick={startNew}><MailIcon name="plus" size="xs" />New template</button>
      {onSearchPalette && <button type="button" className="vsearch" onClick={onSearchPalette} aria-label="Search mail, clients and bookings"><MailIcon name="search" size="xs" /><span>Search mail, clients, bookings</span><kbd>/</kbd></button>}
    </header>
    <div className="cl-wrap templates-wrap" data-view={phoneOpen ? "detail" : "list"}>
      <section className="panel list" aria-label="Templates">
        <div className="list-head">
          <label className="search-in"><MailIcon name="search" size="sm"/><span className="sr">Search templates</span><input type="search" placeholder="Find a template" value={search} onChange={(e)=>setSearch(e.target.value)}/></label>
        </div>
        <div className="list-scroll">
          {filtered.length ? filtered.map((t) => (
            <button type="button" className="cl-row template-row" key={t.id} aria-current={!adding && active?.id === t.id} onClick={() => pick(t)}>
              <span className="av" data-tone="amber"><MailIcon name="templates" size="xs" /></span>
              <span className="cl-main"><b>{t.name}</b><span>{t.body.replace(/\n/g, " ")}</span></span>
            </button>
          )) : <p className="empty-state">{templates.length ? "No templates match." : "No templates yet."}</p>}
        </div>
      </section>
      <section className="panel main">
        <div className="main-scroll"><div className="tpl-page">
          <button type="button" className="btn ghost sm back-btn" onClick={() => setPhoneOpen(false)}><MailIcon name="left" size="xs" />All templates</button>
          <TemplateEditor
            key={adding ? "new" : (active?.id ?? "empty")}
            active={active}
            adding={adding}
            count={templates.length}
            onSaved={() => { setAdding(false); onUpdated(); }}
            onDeleted={(id) => {
              const next = templates.find((t) => t.id !== id);
              setPickedId(next?.id ?? null);
              setAdding(!next);
              onUpdated();
            }}
            onCancel={adding && templates.length > 0 ? () => { setAdding(false); setPickedId(templates[0].id); } : undefined}
          />
        </div></div>
      </section>
    </div>
  </div>;
}
