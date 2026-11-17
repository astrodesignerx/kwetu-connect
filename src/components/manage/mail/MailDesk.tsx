"use client";
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, PencilSimple, Plus } from "@phosphor-icons/react";
import { disconnectMailbox, mailAct, mailFolders, mailList, mailThread, type MailAction, type MessageRow, type ThreadMessage } from "@/app/manage/(staff)/mail/actions";
import type { AccountView } from "@/lib/mail/accounts";
import type { MailboxInfo, Special } from "@/lib/mail/client";
import ConnectMailbox from "./ConnectMailbox";
import MailCompose, { type Draft } from "./MailCompose";
import MailList, { rowKey } from "./MailList";
import MailReader, { type ReplyKind } from "./MailReader";
import { quoteBlock, replySubject } from "./mail-format";

const FOLDERS: [Special, string][] = [["inbox", "Inbox"], ["sent", "Sent"], ["archive", "Archive"], ["spam", "Spam"], ["trash", "Bin"]];
const MOVED: Partial<Record<MailAction, string>> = { archive: "Archived", trash: "Moved to the bin", spam: "Marked as spam", inbox: "Moved to the inbox" };
const PAGE = 40;
type Filter = "all" | "unread" | "starred";
type Pending = { action: MailAction; row: MessageRow; timer: ReturnType<typeof setTimeout>; index: number };

/** The manager's Mail page: your own mailbox, read live from its server. */
export default function MailDesk({ initialAccounts, initialQuery }: { initialAccounts: AccountView[]; initialQuery: string }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [boxes, setBoxes] = useState<MailboxInfo[]>([]);
  const [unread, setUnread] = useState(0);
  const [folder, setFolder] = useState("INBOX");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState(initialQuery);
  const [list, setList] = useState<{ key: string; items: MessageRow[]; total: number; error: string | null }>({ key: "", items: [], total: 0, error: null });
  const [more, setMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState<{ key: string; row: MessageRow } | null>(null);
  const [thread, setThread] = useState<{ key: string; messages: ThreadMessage[]; error: string | null }>({ key: "", messages: [], error: null });
  const [draft, setDraft] = useState<(Draft & { dock: boolean }) | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [seenQuery, setSeenQuery] = useState(initialQuery);
  const pending = useRef<Pending | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const account = accounts.find((a) => a.id === accountId);
  const special: Special = boxes.find((b) => b.path === folder)?.special ?? (folder.toUpperCase() === "INBOX" ? "inbox" : "other");
  // The list wanted now; what is shown belongs to it only once it has arrived.
  const listKey = [accountId, folder, filter, search].join("|");
  const items = list.key === listKey ? list.items : [];
  const loading = list.key !== listKey || more;
  const selected = picked?.key === listKey ? picked.row : null;
  const setItems = (change: (rows: MessageRow[]) => MessageRow[]) => setList((l) => ({ ...l, items: change(l.items) }));
  const setSelected = (row: MessageRow | null) => setPicked(row ? { key: listKey, row } : null);

  // A search typed in the top bar arrives as a new query.
  if (seenQuery !== initialQuery) { setSeenQuery(initialQuery); setSearch(initialQuery); }
  // A plain notice leaves by itself; one with Undo stays for its five seconds.
  useEffect(() => {
    if (!toast || toast.undo) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    void mailFolders(accountId).then((r) => { if (live && r.ok) { setBoxes(r.data.boxes); setUnread(r.data.unread); } });
    return () => { live = false; };
  }, [accountId, tick]);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    const key = [accountId, folder, filter, search].join("|");
    void mailList(accountId, folder, { unread: filter === "unread", flagged: filter === "starred", text: search }, 0, PAGE).then((r) => {
      if (!live) return;
      setList((l) => (r.ok ? { key, items: r.data.items, total: r.data.total, error: null } : { ...(l.key === key ? l : { items: [], total: 0 }), key, error: r.error }));
    });
    return () => { live = false; };
  }, [accountId, folder, filter, search, tick]);

  // New mail: look again every two minutes while the page is open and visible, and on return to the tab.
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible" && !pending.current) setTick((n) => n + 1); };
    const timer = setInterval(again, 120_000);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, []);

  async function loadMore() {
    const key = listKey;
    setMore(true);
    const r = await mailList(accountId, folder, { unread: filter === "unread", flagged: filter === "starred", text: search }, items.length, PAGE);
    setMore(false);
    setList((l) => (l.key !== key ? l : r.ok ? { ...l, items: [...l.items, ...r.data.items.filter((m) => !l.items.some((x) => rowKey(x) === rowKey(m)))], total: r.data.total, error: null } : { ...l, error: r.error }));
  }

  async function open(row: MessageRow) {
    setSelected(row);
    setDraft((d) => (d?.dock ? null : d));
    const key = rowKey(row);
    setThread({ key: "", messages: [], error: null });
    const result = await mailThread(accountId, row.mailbox, row.uid, row.subject);
    setThread(result.ok ? { key, messages: result.data, error: null } : { key, messages: [], error: result.error });
    if (result.ok && !row.seen) { setItems((list) => list.map((m) => (rowKey(m) === rowKey(row) ? { ...m, seen: true } : m))); setUnread((n) => Math.max(0, n - (special === "inbox" ? 1 : 0))); }
  }

  function flush() {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    void mailAct(accountId, p.row.mailbox, [p.row.uid], p.action).then((r) => { if (!r.ok) { setItems((list) => [...list.slice(0, p.index), p.row, ...list.slice(p.index)]); setToast({ text: r.error }); } });
  }

  async function act(action: MailAction) {
    const row = selected;
    if (!row) return;
    if (MOVED[action]) {
      // Moves wait five seconds so they can be undone, then go to the server.
      flush();
      const index = items.findIndex((m) => rowKey(m) === rowKey(row));
      const next = items[index + 1] ?? items[index - 1] ?? null;
      setItems((list) => list.filter((m) => rowKey(m) !== rowKey(row)));
      setSelected(null);
      if (next && window.matchMedia("(min-width: 900px)").matches) void open(next);
      pending.current = { action, row, index, timer: setTimeout(() => { flush(); setToast((t) => (t?.undo ? null : t)); }, 5000) };
      setToast({ text: MOVED[action]!, undo: () => { const p = pending.current; if (!p) return; clearTimeout(p.timer); pending.current = null; setItems((list) => [...list.slice(0, p.index), p.row, ...list.slice(p.index)]); setToast(null); } });
      return;
    }
    const change: Partial<MessageRow> = action === "star" ? { flagged: true } : action === "unstar" ? { flagged: false } : action === "unread" ? { seen: false } : { seen: true };
    setItems((list) => list.map((m) => (rowKey(m) === rowKey(row) ? { ...m, ...change } : m)));
    setSelected({ ...row, ...change });
    if (action === "unread") setSelected(null);
    const result = await mailAct(accountId, row.mailbox, [row.uid], action);
    if (!result.ok) { setItems((list) => list.map((m) => (rowKey(m) === rowKey(row) ? row : m))); setToast({ text: result.error }); }
  }

  function reply(kind: ReplyKind, m: ThreadMessage) {
    const me = account?.email.toLowerCase();
    const sender = m.from[0]?.address ?? "";
    const others = [...m.to, ...m.cc].map((a) => a.address).filter((a) => a && a.toLowerCase() !== me && a.toLowerCase() !== sender.toLowerCase());
    const mineSent = sender.toLowerCase() === me;
    const to = kind === "forward" ? "" : mineSent ? m.to.map((a) => a.address).join(", ") : sender;
    setDraft({
      dock: kind !== "forward", title: kind === "forward" ? "Forward" : kind === "replyAll" ? "Reply to everyone" : "Reply",
      to, cc: kind === "replyAll" ? others.join(", ") : "", subject: replySubject(m.subject, kind === "forward" ? "forward" : "reply"),
      quoted: quoteBlock(m), inReplyTo: kind === "forward" ? null : m.messageId,
      references: kind === "forward" ? [] : [...m.references, ...(m.messageId ? [m.messageId] : [])].slice(-20),
      answers: kind === "forward" ? undefined : { mailbox: m.mailbox, uid: m.uid },
    });
  }

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (draft && !draft.dock && !el.open) el.showModal?.();
    if ((!draft || draft.dock) && el.open) el.close?.();
  }, [draft]);

  function sent() {
    setDraft(null); setToast({ text: "Sent" });
    if (special === "sent") setTick((n) => n + 1);
    if (draft?.answers) setItems((list) => list.map((m) => (m.mailbox === draft.answers!.mailbox && m.uid === draft.answers!.uid ? { ...m, answered: true } : m)));
  }

  async function disconnect() {
    if (!account || !window.confirm(`Disconnect ${account.email}? You can connect it again at any time.`)) return;
    const result = await disconnectMailbox(account.id);
    if (!result.ok) { setToast({ text: result.error }); return; }
    const rest = accounts.filter((a) => a.id !== account.id);
    setAccounts(rest); setAccountId(rest[0]?.id ?? ""); setSelected(null); setBoxes([]); setFolder("INBOX");
  }

  if (!accounts.length || adding) return <div className="mg-mail-setup">
    <ConnectMailbox first={!accounts.length} onCancel={accounts.length ? () => setAdding(false) : undefined} onConnected={(a) => { setAccounts((list) => [...list.filter((x) => x.id !== a.id), a]); setAccountId(a.id); setAdding(false); setFolder("INBOX"); }} />
  </div>;

  const folderPath = (s: Special) => boxes.find((b) => b.special === s)?.path ?? (s === "inbox" ? "INBOX" : null);
  return <section className="mg-mail" data-view={selected ? "reader" : "list"} aria-label="Mail">
    <div className="mg-intro">
      <div className="mg-intro-title"><h1 className="mg-heading">Mail</h1><small>{account?.email}{unread ? ` | ${unread} unread` : ""}</small></div>
      <div className="mg-intro-controls">
        {accounts.length > 1 && <label className="mg-pill mg-mail-switch"><span className="sr-only">Mailbox</span><select value={accountId} onChange={(e) => { flush(); setAccountId(e.target.value); setFolder("INBOX"); setBoxes([]); }}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}</select></label>}
        <button type="button" className="mg-pill" onClick={() => setAdding(true)}><Plus size={13} aria-hidden="true" />Mailbox</button>
        <button type="button" className="mg-pill" onClick={disconnect}>Disconnect</button>
        <button type="button" className="mg-primary" onClick={() => setDraft({ dock: false, title: "New email", to: "", cc: "", subject: "" })}><PencilSimple size={14} aria-hidden="true" />New email</button>
      </div>
    </div>
    <div className="mg-mail-grid">
      <div className="mg-panel mg-mail-side">
        <nav className="mg-mail-folders" aria-label="Folders">
          {FOLDERS.map(([s, label]) => { const path = folderPath(s); if (!path) return null; return <button key={s} type="button" className="mg-mail-folder" aria-current={folder === path || undefined} onClick={() => { flush(); setFolder(path); }}>{label}{s === "inbox" && unread > 0 && <span className="mg-badge" data-tone="alert">{unread}</span>}</button>; })}
        </nav>
        <div className="mg-mail-tools">
          <form role="search" className="mg-mail-search" onSubmit={(e) => { e.preventDefault(); setSearch(String(new FormData(e.currentTarget).get("q") ?? "").trim()); }}>
            <MagnifyingGlass size={14} aria-hidden="true" /><input name="q" key={search} defaultValue={search} placeholder="Search this folder" aria-label="Search this folder" maxLength={200} />
          </form>
          <div className="mg-mail-filter" role="group" aria-label="Show">
            {(["all", "unread", "starred"] as Filter[]).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "unread" ? "Unread" : "Starred"}</button>)}
          </div>
        </div>
        {search && <p className="mg-mail-muted mg-mail-searching">Results for &ldquo;{search}&rdquo; <button type="button" className="mg-mail-link" onClick={() => setSearch("")}>Clear</button></p>}
        <MailList items={items} selected={selected ? rowKey(selected) : null} sentFolder={special === "sent"} inbox={special === "inbox"} loading={loading} error={list.key === listKey ? list.error : null} hasMore={list.key === listKey && items.length < list.total} onOpen={open} onMore={() => void loadMore()} onRetry={() => setTick((n) => n + 1)} />
      </div>
      <div className="mg-panel mg-mail-main">
        <MailReader accountId={accountId} special={special} messages={selected && thread.key === rowKey(selected) ? thread.messages : []} loading={!!selected && thread.key !== rowKey(selected)} error={selected && thread.key === rowKey(selected) ? thread.error : null} flagged={!!selected?.flagged} onAct={act} onReply={reply} onBack={() => setSelected(null)} onRetry={() => selected && void open(selected)}>
          {draft?.dock && account && <MailCompose key={draft.subject + draft.to} accountId={accountId} from={account.email} draft={draft} onSent={sent} onClose={() => setDraft(null)} />}
        </MailReader>
      </div>
    </div>
    <dialog ref={dialog} className="mg-mail-dialog" aria-label="Write an email" onClose={() => setDraft((d) => (d && !d.dock ? null : d))}>
      {draft && !draft.dock && account && <MailCompose key={draft.title + draft.subject} accountId={accountId} from={account.email} draft={draft} onSent={sent} onClose={() => setDraft(null)} />}
    </dialog>
    <div className="mg-mail-toast" role="status" aria-live="polite">{toast && <span>{toast.text}{toast.undo && <button type="button" onClick={toast.undo}>Undo</button>}<button type="button" onClick={() => setToast(null)} aria-label="Dismiss">Close</button></span>}</div>
  </section>;
}
