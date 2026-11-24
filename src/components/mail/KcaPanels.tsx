"use client";
import { useEffect, useMemo, useState } from "react";
import type { MailDirectory, Booking } from "@/lib/store/types";
import { advertState, bookingHref, clientsFrom, managerAction, managerBrief, matchIndex, threadKey, type Client, type Match } from "@/lib/mail/kca";
import { liveProgress } from "@/lib/booking/pipeline";
import { scheduleLines } from "@/lib/booking/selection";
import { mailAssign, mailClientConversations, mailSaveNote, mailSaveTemplate, mailDeleteTemplate, mailWaiting, mailWorkspace } from "@/app/mail/kca-actions";
import type { ConversationRow } from "@/lib/mail/conversations";
import type { ClientNote, Template } from "@/lib/mail/kca-data";
import { mailRequest } from "./mail-request";
import QuickQuote from "./QuickQuote";

export type Workspace = Extract<Awaited<ReturnType<typeof mailWorkspace>>, { ok: true }>["data"];
export const money = (value: number) => "KES " + value.toLocaleString("en-GB");
export function BookingCard({ booking: b, data, today }: { booking: Booking; data: MailDirectory; today: string }) {
  const action = managerAction(data, b), run = liveProgress(b, today);
  return <section className="mail-card"><h3><a href={bookingHref(b)}>{b.reference}</a> | {b.status}</h3>
    <dl><dt>Plan</dt><dd>{b.request.lengthSeconds} s | {b.request.howOften} plays an hour<br />{scheduleLines(b.request, data.settings.timeBlocks).join(" / ")}</dd>
      <dt>Dates</dt><dd>{b.request.startDate} to {b.request.endDate}</dd><dt>Plays</dt><dd>{b.plays.toLocaleString("en-GB")}</dd><dt>Price</dt><dd>{money(b.priceKes)}</dd><dt>Advert</dt><dd>{advertState(data,b)}</dd></dl>
    {b.status === "Live" && <p>Day {run.day} of {run.total}<progress aria-label="Run progress" value={run.day} max={run.total} /></p>}
    <a href={action.href}>{action.label}</a>
  </section>;
}
export function NoteEditor({ email, note, onSaved }: { email: string; note?: ClientNote; onSaved: (note: ClientNote) => void }) {
  const [value, setValue] = useState(note?.note ?? ""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  return <form className="mail-note-editor" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await mailRequest(mailSaveNote(email,value)); setBusy(false); if (r.ok) { onSaved(r.data); setMessage("Note saved"); } else setMessage(r.error); }}>
    <label>Client note<textarea aria-label="Client note" maxLength={10000} rows={3} value={value} onChange={(e) => setValue(e.target.value)} /></label><button disabled={busy}>Save note</button>
    {note && <small>Updated by {note.updated_by} on {new Date(note.updated_at).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</small>}<p role="status">{message}</p>
  </form>;
}
export function Inspector({ match, workspace: w, accountId, subject, onClient, onReplyText, onUpdated, onNote }: { match: Match; workspace: Workspace; accountId: string; subject: string; onClient: (id: string) => void; onReplyText: (text: string) => void; onUpdated: () => void; onNote: (note: ClientNote) => void }) {
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const assigned = w.meta.find((m) => m.thread_key === threadKey(subject))?.assigned_email;
  return <aside className="mail-inspector" aria-label="Client and booking"><h2>Inspector</h2>
    {match.client ? <section className="mail-card"><h3>Client</h3><b>{match.client.advertiser.business}</b><p>{match.client.advertiser.name}<br />{match.client.advertiser.phone}<br />{match.client.emails.join(", ") || "No email on file"}</p><button type="button" onClick={() => onClient(match.client!.id)}>Open client</button><p>Matched by {match.by}.</p></section>
      : <p>{w.directory ? match.unknownReference ? `No booking matches ${match.unknownReference}.` : "No matching client or booking." : "Booking lookup is unavailable. Mail is still available."}</p>}
    {match.booking && w.directory && <BookingCard booking={match.booking} data={w.directory} today={w.today} />}
    {w.directory && <QuickQuote settings={w.directory.settings} today={w.today} onInsert={onReplyText} />}
    <section className="mail-card"><h3>Team</h3><p>Assigned: {assigned ?? "Nobody yet"}</p><button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await mailRequest(mailAssign(accountId, subject, assigned ? null : w.me)); setBusy(false); if (r.ok) { onUpdated(); setMessage(assigned ? "Unassigned" : "Assigned to you"); } else setMessage(r.error); }}>{assigned ? "Unassign" : "Assign to me"}</button><p className="mg-mail-muted">This mailbox is personal. Only its owner can read its assignments.</p><p role="status">{message}</p>
      {match.client?.emails[0] && <NoteEditor key={match.client.emails[0]} email={match.client.emails[0]} note={w.notes.find((n) => n.advertiser_email === match.client!.emails[0])} onSaved={onNote} />}
    </section>
    {!!w.templates.length && <section className="mail-card"><h3>Quick replies</h3>{w.templates.map((t) => <button type="button" key={t.id} onClick={() => onReplyText(t.body)}>{t.name}</button>)}</section>}
  </aside>;
}

export function MorningBrief({ workspace: w, tick, onOpen }: { workspace: Workspace | null; tick: number; onOpen: (row: ConversationRow, reply?: boolean) => void }) {
  const [waiting, setWaiting] = useState<Awaited<ReturnType<typeof mailWaiting>> | null>(null);
  useEffect(() => { let live = true; void mailRequest(mailWaiting()).then((r) => { if(live) setWaiting(r); }); return () => { live = false; }; }, [tick]);
  const data = w?.directory, manager = data && managerBrief(data,w.today), match = data ? matchIndex(data) : null;
  return <section className="mail-brief"><h2>Morning brief</h2>{w && <p>{w.today}</p>}
    {!waiting ? <p>Loading conversations</p> : !waiting.ok ? <p role="alert">{waiting.error}</p> : <>
      {waiting.data.errors.map((error) => <p role="alert" key={error}>{error}</p>)}{waiting.data.partial && <p>Some folders contain more than 300 messages or could not be read. This brief is partial.</p>}
      {!!waiting.data.items.length && <section className="mail-card"><h3>Waiting on you, oldest first ({waiting.data.items.length}{waiting.data.partial ? "+" : ""})</h3>{waiting.data.items.map((r) => { const client = match?.({ subject:r.subject, addresses:[r.from.address,...r.to.map((a) => a.address),...(r.cc ?? []).map((a) => a.address)] }).client; return <div className="mail-summary-row" key={`${r.accountId}:${r.mailbox}:${r.uid}`}><b>{r.from.name || r.from.address}</b><span>{client?.advertiser.business ?? "No matching client"}</span><span>{r.subject}</span><small>{r.date ? new Date(r.date).toLocaleString("en-GB", { timeZone:"Africa/Nairobi" }) : "Date unknown"}</small><button type="button" onClick={() => onOpen(r,true)}>Reply</button></div>; })}</section>}
    </>}
    {data && manager && <>{([ ["Adverts waiting for review",manager.review], ["Quotes waiting for payment",manager.payment], ["Bookings live today",manager.live] ] as const).filter(([,rows]) => rows.length).map(([title,rows]) => <section className="mail-card" key={title}><h3>From the manager: {title} ({rows.length})</h3>{rows.slice(0,5).map((b) => <p key={b.id}><a href={title.startsWith("Adverts") ? "/manage/adverts?q="+encodeURIComponent(b.reference) : bookingHref(b)}>{data.advertisers.find((a) => a.id === b.advertiserId)?.business} | {b.reference}</a> | {money(b.priceKes)}</p>)}</section>)}
    {!!manager.next.length && <section className="mail-card"><h3>Next go-lives in the coming 7 days</h3>{manager.next.map((b) => <p key={b.id}><a href={bookingHref(b)}>{data.advertisers.find((a) => a.id === b.advertiserId)?.business} | {b.reference}</a><br />{b.request.startDate} | {b.status} | Advert: {advertState(data,b)}</p>)}</section>}</>}
    {w?.errors.map((error) => <p role="alert" key={error}>{error}</p>)}
  </section>;
}

export function ClientsView({ workspace: w, clientId, onClient, onNew, onOpen, onNote }: { workspace: Workspace; clientId: string; onClient: (id:string) => void; onNew: (email:string) => void; onOpen:(row:ConversationRow) => void; onNote:(note:ClientNote) => void }) {
  const [search,setSearch] = useState("");
  const clients = useMemo(() => w.directory ? clientsFrom(w.directory) : [], [w.directory]);
  const client = clients.find((c) => c.id === clientId);
  return <div className="mail-clients" data-detail={!!client || undefined}><section className="mg-mail-side"><div className="mail-list-tools"><h2>Clients</h2><label>Search clients<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label><p>From bookings</p></div><div className="mg-mail-scroll">
    {!w.directory ? <p>Clients could not be loaded. Try Refresh.</p> : !clients.length ? <p>No advertisers in bookings yet.</p> : clients.filter((c) => `${c.advertiser.business} ${c.advertiser.name} ${c.emails.join(" ")} ${c.bookings.map((b) => b.reference).join(" ")}`.toLowerCase().includes(search.toLowerCase())).map((c) => <button type="button" className="mg-mail-row" key={c.id} aria-current={c.id === clientId || undefined} onClick={() => onClient(c.id)}><span><b>{c.advertiser.business}</b><small>{c.advertiser.name}</small><small>{c.bookings[0] ? `${c.bookings[0].status} | ${money(c.bookings[0].priceKes)}` : "No bookings"}</small></span></button>)}
  </div></section><section className="mg-mail-main">{client && w.directory ? <ClientDetail key={client.id} client={client} workspace={w} onBack={() => onClient("")} onNew={onNew} onOpen={onOpen} onNote={onNote} /> : <p>Choose a client.</p>}</section></div>;
}
function ClientDetail({ client:c, workspace:w, onBack, onNew, onOpen, onNote }: { client:Client; workspace:Workspace; onBack:()=>void; onNew:(email:string)=>void; onOpen:(row:ConversationRow)=>void; onNote:(note:ClientNote)=>void }) {
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof mailClientConversations>> | null>(null);
  const emails = c.emails.join(",");
  useEffect(() => { let live=true; if(emails) void mailRequest(mailClientConversations(emails.split(","))).then((r) => { if(live) setConversations(r); }); return () => { live=false; }; }, [emails]);
  return <div className="mail-client-detail"><button type="button" onClick={onBack}>Back to clients</button><h2>{c.advertiser.business}</h2><p>{c.advertiser.name} | {c.advertiser.phone}<br />{c.emails.join(", ") || "No email on file"}</p><button type="button" disabled={!c.emails.length} onClick={() => onNew(c.emails[0])}>New email to client</button>
    <p>Total booked: {money(c.bookings.filter((b) => b.status !== "Cancelled").reduce((sum,b) => sum+b.priceKes,0))} | {c.bookings.length} bookings</p><p className="mg-mail-muted">Total booked includes quotes and excludes cancelled bookings. It is not a payment total.</p><h3>Bookings</h3>{c.bookings.map((b) => <BookingCard key={b.id} booking={b} data={w.directory!} today={w.today} />)}
    <h3>Conversations in your connected mailboxes</h3>{!emails ? <p>No email on file to match.</p> : !conversations ? <p>Loading conversations</p> : !conversations.ok ? <p role="alert">{conversations.error}</p> : <>{conversations.data.errors.map((error) => <p key={error} role="alert">{error}</p>)}{conversations.data.partial && <p>Partial results, up to 300 messages per folder.</p>}{!conversations.data.items.length && <p>No matching conversations.</p>}{conversations.data.items.map((r) => <p key={`${r.accountId}:${r.mailbox}:${r.uid}`}><button type="button" onClick={() => onOpen(r)}>{r.subject}</button></p>)}</>}
    {emails && <NoteEditor email={c.emails[0]} note={w.notes.find((n) => n.advertiser_email === c.emails[0])} onSaved={onNote} />}
  </div>;
}
export function TemplatesView({ templates, onUpdated }: { templates:Template[]; onUpdated:()=>void }) {
  const [editing,setEditing] = useState<Template | null>(null), [message,setMessage] = useState(""), [busy,setBusy] = useState(false);
  return <section className="mail-templates"><h2>Templates</h2><p>Quick replies are shared with staff. Lower sort numbers appear first.</p>
    <form key={editing?.id ?? "new"} className="mail-card" onSubmit={async (e) => { e.preventDefault(); const form=e.currentTarget, f=new FormData(form); setBusy(true); const r=await mailRequest(mailSaveTemplate({ id:editing?.id, name:String(f.get("name")), body:String(f.get("body")), sort_order:Number(f.get("order")) })); setBusy(false); if(r.ok) { setEditing(null); form.reset(); onUpdated(); setMessage("Template saved"); } else setMessage(r.error); }}>
      <h3>{editing ? "Edit template" : "Add template"}</h3><label>Name<input name="name" required maxLength={100} defaultValue={editing?.name ?? ""} /></label><label>Reply text<textarea name="body" required rows={5} maxLength={10000} defaultValue={editing?.body ?? ""} /></label><label>Sort order<input name="order" type="number" min={-100000} max={100000} step={1} required defaultValue={editing?.sort_order ?? templates.length} /></label><button disabled={busy}>Save template</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel edit</button>}
    </form><p role="status">{message}</p>{templates.map((t) => <article className="mail-card" key={t.id}><h3>{t.name}</h3><p className="mail-template-body">{t.body}</p><small>Sort order: {t.sort_order}</small><div><button type="button" onClick={() => setEditing(t)}>Edit {t.name}</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); const r=await mailRequest(mailDeleteTemplate(t.id)); setBusy(false); if(r.ok) { onUpdated(); if(editing?.id===t.id) setEditing(null); setMessage("Template deleted"); } else setMessage(r.error); }}>Delete {t.name}</button></div></article>)}
  </section>;
}
