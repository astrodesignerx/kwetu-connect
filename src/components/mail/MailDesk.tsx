"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { mailAct, mailFolders, mailList, mailThread, mailDrafts, type MailAction, type MessageRow, type ThreadMessage } from "@/app/mail/actions";
import type { AccountView } from "@/lib/mail/accounts";
import type { SavedDraft } from "@/lib/mail/drafts";
import type { MailboxInfo, Special } from "@/lib/mail/client";
import ConnectMailbox from "./ConnectMailbox";
import MailCompose, { type Draft } from "./MailCompose";
import MailList, { rowKey } from "./MailList";
import MailReader, { type ReplyKind } from "./MailReader";
import { mailRequest } from "./mail-request";
import MailTheme from "./MailTheme";
import { quoteBlock, replySubject } from "./mail-format";
import { mailAssigned, mailWorkspace } from "@/app/mail/kca-actions";
import { matchIndex, bookingHref } from "@/lib/mail/kca";
import type { ClientNote } from "@/lib/mail/kca-data";
import type { ConversationRow } from "@/lib/mail/conversations";
import { ClientsView, Inspector, MorningBrief, TemplatesView, type Workspace } from "./KcaPanels";

const RAIL = ["Inbox", "Assigned", "Drafts", "Sent", "Archive", "Clients", "Templates", "Starred", "Spam", "Bin"] as const;
type View = typeof RAIL[number];
const SPECIAL: Partial<Record<View, Special>> = { Inbox: "inbox", Sent: "sent", Archive: "archive", Spam: "spam", Bin: "trash" };
const SPECIAL_VIEWS = ["Clients", "Templates"];

export default function MailDesk({ initialAccounts, initialQuery, demo = false }: { initialAccounts: AccountView[]; initialQuery: string; demo?: boolean }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [workspace,setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError,setWorkspaceError] = useState("");
  const [clientId,setClientId] = useState("");
  const [briefOpen,setBriefOpen] = useState(false);
  const [pending,setPending] = useState<{row:ConversationRow;reply:boolean} | null>(null);
  const [adding, setAdding] = useState(false);
  const [boxes, setBoxes] = useState<MailboxInfo[]>([]);
  const [view, setView] = useState<View>("Inbox");
  const [search, setSearch] = useState(initialQuery);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sync, setSync] = useState("Checking mail");
  const [tick, setTick] = useState(0);
  const [list, setList] = useState<{ key: string; items: MessageRow[]; total: number; error: string | null }>({ key: "", items: [], total: 0, error: null });
  const [saved, setSaved] = useState<SavedDraft[]>([]);
  const [picked, setPicked] = useState<{ key: string; row: MessageRow } | null>(null);
  const [thread, setThread] = useState<{ key: string; messages: ThreadMessage[]; error: string | null }>({ key: "", messages: [], error: null });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const openSequence = useRef(0);
  const account = accounts.find((a) => a.id === accountId);
  const special = SPECIAL[view] ?? "inbox";
  const folder = view === "Starred" ? "__starred__" : boxes.find((b) => b.special === special)?.path ?? (special === "inbox" ? "INBOX" : "");
  const listKey = [accountId, view, folder, search, unreadOnly].join("|");
  const wanted = useRef(listKey);
  useEffect(() => { wanted.current = listKey; }, [listKey]);
  const selected = picked?.key === listKey ? picked.row : null;
  const items = list.key === listKey ? list.items : [];
  const loading = list.key !== listKey;
  const placeholder = SPECIAL_VIEWS.includes(view);
  const match = useMemo(() => {
    if(!workspace?.directory) return {client:null,booking:null,by:null};
    const messages=selected && thread.key === rowKey(selected) ? thread.messages : [];
    return matchIndex(workspace.directory)({subject:messages.map((m) => m.subject).join("\n") || selected?.subject || "",text:messages.map((m) => m.text).join("\n"),html:messages.map((m) => m.html ?? "").join("\n"),addresses:messages.length ? messages.flatMap((m) => [...m.from,...m.to,...m.cc].map((a) => a.address)) : selected ? [selected.from.address,...selected.to.map((a) => a.address),...(selected.cc ?? []).map((a) => a.address)] : []});
  },[workspace?.directory,selected,thread]);
  useEffect(() => {
    if(!accountId) return;
    let live=true;
    void mailRequest(mailWorkspace(accountId)).then((r) => {if(!live) return; if(r.ok) {setWorkspace(r.data);setWorkspaceError("");} else {setWorkspace(null);setWorkspaceError(r.error);}});
    return () => {live=false;};
  },[accountId,tick]);
  useEffect(() => {
    if(!pending || accountId!==pending.row.accountId || view!=="Inbox") return;
    const timer=setTimeout(() => {void open(pending.row,pending.reply);setPending(null);},0);
    return () => clearTimeout(timer);
    // Opening waits until the selected mailbox and its list key have committed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pending,accountId,view,listKey]);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    void mailRequest(mailFolders(accountId)).then((r) => {
      if (!live) return;
      if (r.ok) { setBoxes(r.data.boxes); setUnread(r.data.unread); setSync(demo ? "Sample mailbox" : "Checked at " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })); }
      else setSync("Mail check failed: " + r.error);
    }).catch(() => { if (live) setSync("Mail check failed. Reload to try again."); });
    return () => { live = false; };
  }, [accountId, tick, demo]);
  useEffect(() => {
    if (!accountId || placeholder) return;
    let live = true;
    if (view === "Drafts") {
      void mailRequest(mailDrafts(accountId)).then((r) => { if (live) { if (r.ok) setSaved(r.data); setList({ key: listKey, items: [], total: 0, error: r.ok ? null : r.error }); } });
    } else if(view === "Assigned") {
      void mailRequest(mailAssigned(accountId)).then((r) => {if(live) setList(r.ok ? {key:listKey,items:r.data.items,total:r.data.items.length,error:r.data.errors.join(" ") || (r.data.partial ? "Partial results, up to 300 messages per folder." : null)} : {key:listKey,items:[],total:0,error:r.error});});
    } else if (folder) {
      void mailRequest(mailList(accountId, folder, { text: search, unread: unreadOnly, flagged: view === "Starred" })).then((r) => { if (live) setList(r.ok ? { key: listKey, items: r.data.items, total: r.data.total, error: null } : { key: listKey, items: [], total: 0, error: r.error }); });
    }
    return () => { live = false; };
  }, [accountId, view, folder, search, unreadOnly, tick, listKey, placeholder]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    const timer = setInterval(refresh, 120_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => {
    const el = dialog.current;
    if (draft && el && !el.open) el.showModal();
    if (!draft && el?.open) el.close();
  }, [draft]);

  async function open(row: MessageRow, replyNow = false) {
    setBriefOpen(false);
    const sequence = ++openSequence.current;
    const key = listKey;
    setPicked({ key, row });
    setThread({ key: "", messages: [], error: null });
    const r = await mailRequest(mailThread(accountId, row.mailbox, row.uid, row.subject));
    if (sequence !== openSequence.current || wanted.current !== key) return;
    setThread(r.ok ? { key: rowKey(row), messages: r.data, error: null } : { key: rowKey(row), messages: [], error: r.error });
    if (r.ok) { if(replyNow && r.data.length) reply("reply",r.data[r.data.length-1]); setList((l) => ({ ...l, items: l.items.map((m) => rowKey(m) === rowKey(row) ? { ...m, seen: true } : m) })); setTick((n) => n + 1); }
  }
  async function act(action: MailAction) {
    if (!selected || busy) return;
    const row = selected; const key = listKey;
    setBusy(true);
    const r = await mailRequest(mailAct(accountId, row.mailbox, [row.uid], action));
    setBusy(false);
    if (!r.ok) { setNotice(r.error); return; }
    if (wanted.current !== key) return;
    if (["archive", "trash", "spam", "inbox", "unread"].includes(action)) { setPicked(null); openSequence.current++; }
    else setPicked({ key, row: { ...row, flagged: action === "star" ? true : action === "unstar" ? false : row.flagged } });
    setNotice(action === "archive" ? "Archived" : action === "star" ? "Starred" : action === "inbox" ? "Moved to Inbox" : "Message updated");
    setTick((n) => n + 1);
  }
  function reply(kind: ReplyKind, m: ThreadMessage, text = "") {
    const me = account?.email.toLowerCase(); const sender = m.from[0]?.address ?? "";
    const others = [...new Set([...m.to, ...m.cc].map((a) => a.address).filter((a) => a && a.toLowerCase() !== me && a.toLowerCase() !== sender.toLowerCase()))];
    setDraft({ body: text, title: kind === "forward" ? "Forward" : kind === "replyAll" ? "Reply all" : "Reply", to: kind === "forward" ? "" : sender.toLowerCase() === me ? m.to.map((a) => a.address).join(", ") : sender, cc: kind === "replyAll" ? others.join(", ") : "", subject: replySubject(m.subject, kind === "forward" ? "forward" : "reply"), quoted: quoteBlock(m), inReplyTo: kind === "forward" ? null : m.messageId, references: kind === "forward" ? [] : [...m.references, ...(m.messageId ? [m.messageId] : [])].slice(-20), answers: kind === "forward" ? undefined : { mailbox: m.mailbox, uid: m.uid } });
  }
  async function more() {
    if (busy) return; setBusy(true);
    const key = listKey;
    const r = await mailRequest(mailList(accountId, folder, { text: search, unread: unreadOnly, flagged: view === "Starred" }, items.length));
    setBusy(false);
    if (!r.ok) { setNotice(r.error); return; }
    setList((l) => l.key !== key ? l : { ...l, items: [...l.items, ...r.data.items.filter((x) => !l.items.some((m) => rowKey(m) === rowKey(x)))], total: r.data.total });
  }
  function navigate(next: View) { openSequence.current++; setView(next); setPicked(null); setBriefOpen(false); setNotice(""); }
  function external(row:ConversationRow, replyNow=false) {setAccountId(row.accountId);navigate("Inbox");setPending({row,reply:replyNow});}
  function saveNote(note:ClientNote) {setWorkspace((w) => w ? {...w,notes:[...w.notes.filter((n) => n.advertiser_email!==note.advertiser_email),note]} : w);}
  function replyText(text:string) {const messages=thread.messages; if(selected && messages.length) reply("reply",messages[messages.length-1],text);}
  const setup = !accounts.length || adding;
  return <section className="mail-shell" data-view={selected || briefOpen ? "reader" : "list"}>
    <nav className="mail-rail" aria-label="Mail navigation"><Link href="/mail" className="mail-brand">KCA Mail</Link>
      <button type="button" onClick={() => {navigate("Inbox");setBriefOpen(true);}}>Morning brief</button>
      {RAIL.map((name) => <button type="button" key={name} aria-current={!setup && view === name ? "page" : undefined} onClick={() => { setAdding(false); navigate(name); }}>{name}{name === "Inbox" && unread > 0 ? ` (${unread})` : ""}</button>)}
      <div className="mail-rail-bottom"><Link href="/manage">Manager</Link><Link href="/mail/settings">Settings</Link></div>
    </nav>
    <header className="mail-topbar"><h1 className="mg-heading">Mail</h1><button type="button" onClick={() => document.getElementById("mail-search")?.focus()} disabled={setup || placeholder || view === "Drafts"}>Search</button><span className="mail-sync" role="status">{sync}</span><button type="button" onClick={() => setTick((n) => n + 1)}>Refresh</button><MailTheme /><button type="button" className={account ? "mg-primary" : undefined} disabled={!account} onClick={() => setDraft({ title: "New email", to: "", cc: "", subject: "" })}>New email</button></header>
    <main className="mail-workspace">
      {setup ? <ConnectMailbox demo={demo} first={!accounts.length} onCancel={accounts.length ? () => setAdding(false) : undefined} onConnected={(a) => { setAccounts((old) => [...old.filter((x) => x.id !== a.id), a]); setAccountId(a.id); setAdding(false); navigate("Inbox"); setTick((n) => n + 1); }} />
        : view === "Clients" ? workspace ? <ClientsView workspace={workspace} clientId={clientId} onClient={setClientId} onNote={saveNote} onNew={(email) => setDraft({title:"New email",to:email,cc:"",subject:""})} onOpen={external} /> : <section className="mg-mail-empty"><p>{workspaceError || "Loading clients"}</p></section>
        : view === "Templates" ? workspace ? <div className="mail-templates-wrap">{workspace.errors.map((error) => <p key={error} role="alert">{error}</p>)}<TemplatesView templates={workspace.templates} onUpdated={() => setTick((n) => n+1)} /></div> : <section className="mg-mail-empty"><p>{workspaceError || "Loading templates"}</p></section>
        : <><section className="mg-mail-side" aria-label={view}>
          <div className="mail-list-tools"><h2>{view}</h2>{search && <p>Results for &ldquo;{search}&rdquo;</p>}<label>Mailbox<select aria-label="Mailbox" value={accountId} onChange={(e) => { openSequence.current++; setAccountId(e.target.value); setBoxes([]); setPicked(null); navigate("Inbox"); }}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}</select></label><button type="button" onClick={() => setAdding(true)}>Connect mailbox</button>
            {view !== "Drafts" && <><form role="search" onSubmit={(e) => { e.preventDefault(); setSearch(String(new FormData(e.currentTarget).get("q") ?? "")); setPicked(null); }}><input id="mail-search" name="q" defaultValue={search} placeholder="Search this folder" aria-label="Search this folder" maxLength={200} /><button type="submit">Search folder</button></form><label><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label></>}
          </div>
          {view === "Drafts" ? <div className="mg-mail-scroll">{loading ? <p>Loading drafts</p> : list.error ? <p role="alert">{list.error}</p> : !saved.length ? <p>No saved drafts.</p> : saved.filter((r) => !search || r.data.subject.toLowerCase().includes(search.toLowerCase())).map((r) => <button type="button" className="mg-mail-row" key={r.id} onClick={() => setDraft({ ...r.data, saved: r })}><span>{r.data.subject || "(no subject)"}<small>{r.data.to || "No recipient"}{r.send_state !== "draft" ? " | Check Sent before sending again" : ""}</small></span></button>)}<p>Drafts are saved in this app. Mail-server drafts stay on your mail server.</p></div>
            : !folder ? <p className="mg-mail-empty">{boxes.length ? "This mailbox has no " + view + " folder." : "Loading folders"}</p>
            : <MailList items={view === "Assigned" ? items.filter((r) => (!search || `${r.subject} ${r.from.address}`.toLowerCase().includes(search.toLowerCase())) && (!unreadOnly || !r.seen)) : items} selected={selected ? rowKey(selected) : null} sentFolder={special === "sent"} inbox={view === "Inbox"} loading={loading || busy} error={list.key === listKey ? list.error : null} hasMore={view !== "Assigned" && items.length < list.total} onOpen={(row) => void open(row)} onMore={() => void more()} onRetry={() => setTick((n) => n + 1)} />}
        </section><section className="mg-mail-main" aria-label="Reader" inert={busy}>
          {!selected ? <><button type="button" className="mg-mail-back" onClick={() => setBriefOpen(false)}>Back to list</button>{workspaceError && <p role="alert">{workspaceError}</p>}<MorningBrief workspace={workspace} tick={tick} onOpen={external} /></> : <><div className="mail-context-layout"><MailReader chips={<div className="mail-chips">{match.client && <button type="button" onClick={() => {setClientId(match.client!.id);navigate("Clients");}}>{match.client.advertiser.business}</button>}{match.booking && <a href={bookingHref(match.booking)}>{match.booking.reference} | {match.booking.status}</a>}{!match.client && <span>{workspace?.directory ? "Unmatched conversation" : "Booking lookup unavailable"}</span>}</div>} bookedSeconds={match.booking?.request.lengthSeconds} accountId={accountId} special={boxes.find((b) => b.path === selected?.mailbox)?.special ?? special} messages={selected && thread.key === rowKey(selected) ? thread.messages : []} loading={!!selected && thread.key !== rowKey(selected)} error={selected && thread.key === rowKey(selected) ? thread.error : null} flagged={!!selected?.flagged} onAct={(action) => void act(action)} onReply={reply} onBack={() => setPicked(null)} onRetry={() => selected && void open(selected)} />
          {workspace && !loading && thread.key===rowKey(selected) && thread.messages.length>0 && <Inspector match={match} workspace={workspace} accountId={accountId} subject={selected.subject} onClient={(id) => {setClientId(id);navigate("Clients");}} onReplyText={replyText} onUpdated={() => setTick((n) => n+1)} onNote={saveNote} />}</div>{workspace?.errors.map((error) => <p role="alert" key={error}>{error}</p>)}{workspaceError && <p role="alert">{workspaceError}</p>}</>}
        </section></>}
    </main>
    <dialog ref={dialog} className="mg-mail-dialog" aria-label="Write an email" onCancel={(e) => e.preventDefault()}>{draft && account && <MailCompose key={draft.saved?.id ?? draft.title + draft.subject} templates={workspace?.templates} accountId={accountId} from={account.email} draft={draft} onClose={() => { setDraft(null); setTick((n) => n + 1); }} onSent={() => { setDraft(null); setNotice(demo ? "Saved to sample Sent. No email was delivered." : "Sent"); setTick((n) => n + 1); }} />}</dialog>
    <p className="mail-notice" role="status">{demo ? "Sample data. Nothing is saved to the booking store. " : ""}{notice}</p>
  </section>;
}
