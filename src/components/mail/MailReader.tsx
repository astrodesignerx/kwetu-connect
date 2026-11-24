"use client";
import { useState } from "react";
import { Archive, ArrowBendDoubleUpLeft, ArrowBendUpLeft, ArrowBendUpRight, ArrowLeft, EnvelopeSimple, FileArrowDown, Star, Trash, Tray, WarningOctagon } from "@phosphor-icons/react";
import type { MailAction, ThreadMessage } from "@/app/mail/actions";
import type { Special } from "@/lib/mail/client";
import MessageFrame from "./MessageFrame";
import AdvertAttachment from "./AdvertAttachment";
import { fileSize, fullTime, initials, senderName } from "./mail-format";

export type ReplyKind = "reply" | "replyAll" | "forward";

/** The open conversation: every message in order, the newest open, with Reply first and the rest as quiet pills. */
export default function MailReader({ accountId, special, messages, loading, error, flagged, onAct, onReply, onBack, onRetry, children, chips, bookedSeconds }: {
  accountId: string; special: Special; messages: ThreadMessage[]; loading: boolean; error: string | null; flagged: boolean;
  onAct: (action: MailAction) => void; onReply: (kind: ReplyKind, message: ThreadMessage) => void; onBack: () => void; onRetry: () => void; children?: React.ReactNode;
  chips?: React.ReactNode; bookedSeconds?: number;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const latest = messages[messages.length - 1];
  if (error && !messages.length) return <div className="mg-mail-empty" role="alert"><p>{error}</p><button type="button" className="mg-pill" onClick={onRetry}>Try again</button></div>;
  if (!latest) return <div className="mg-mail-empty" aria-busy={loading}>{loading ? <ReaderSkeleton /> : <p>Choose a conversation to read it here.</p>}</div>;
  const many = latest.to.length + latest.cc.length > 1;
  const key = (m: ThreadMessage) => `${m.mailbox}:${m.uid}`;
  return <article className="mg-mail-reader" aria-busy={loading} aria-labelledby="mg-mail-subject">
    <header className="mg-mail-reader-head">
      <button type="button" className="mg-icon-button mg-mail-back" onClick={onBack} aria-label="Back to the list"><ArrowLeft size={16} aria-hidden="true" /></button>
      <h2 id="mg-mail-subject">{latest.subject}</h2>
      {chips}
      <div className="mg-mail-actions" role="toolbar" aria-label="Conversation">
        <button type="button" className="mg-primary" onClick={() => onReply("reply", latest)}><ArrowBendUpLeft size={14} aria-hidden="true" />Reply</button>
        {many && <button type="button" className="mg-pill" onClick={() => onReply("replyAll", latest)}><ArrowBendDoubleUpLeft size={14} aria-hidden="true" />Reply all</button>}
        <button type="button" className="mg-pill" onClick={() => onReply("forward", latest)}><ArrowBendUpRight size={14} aria-hidden="true" />Forward</button>
        {special === "inbox" ? <button type="button" className="mg-icon-button" onClick={() => onAct("archive")} aria-label="Archive" title="Archive"><Archive size={16} aria-hidden="true" /></button>
          : special !== "sent" && <button type="button" className="mg-icon-button" onClick={() => onAct("inbox")} aria-label="Move to inbox" title="Move to inbox"><Tray size={16} aria-hidden="true" /></button>}
        {special !== "trash" && <button type="button" className="mg-icon-button" onClick={() => onAct("trash")} aria-label="Move to bin" title="Move to bin"><Trash size={16} aria-hidden="true" /></button>}
        {special === "inbox" && <button type="button" className="mg-icon-button" onClick={() => onAct("spam")} aria-label="Mark as spam" title="Mark as spam"><WarningOctagon size={16} aria-hidden="true" /></button>}
        <button type="button" className="mg-icon-button" onClick={() => onAct(flagged ? "unstar" : "star")} aria-label={flagged ? "Remove star" : "Star"} aria-pressed={flagged} title={flagged ? "Remove star" : "Star"}><Star size={16} weight={flagged ? "fill" : "regular"} aria-hidden="true" /></button>
        <button type="button" className="mg-icon-button" onClick={() => onAct("unread")} aria-label="Mark as unread" title="Mark as unread"><EnvelopeSimple size={16} aria-hidden="true" /></button>
      </div>
    </header>
    <ol className="mg-mail-thread">
      {messages.map((m) => {
        const expanded = m === latest || open.has(key(m));
        const from = m.from[0] ?? { name: "", address: "" };
        return <li key={key(m)} className="mg-mail-message" data-open={expanded || undefined}>
          <button type="button" className="mg-mail-message-head" aria-expanded={expanded} disabled={m === latest} onClick={() => setOpen((s) => { const next = new Set(s); if (next.has(key(m))) next.delete(key(m)); else next.add(key(m)); return next; })}>
            <span className="mg-avatar" aria-hidden="true">{initials(from.name, from.address)}</span>
            <span className="mg-mail-message-who">
              <b>{senderName(from)}</b>
              <small>{expanded ? `${from.address}${m.to.length ? `, to ${m.to.map(senderName).join(", ")}` : ""}${m.cc.length ? `, copy ${m.cc.map(senderName).join(", ")}` : ""}` : m.text.replace(/\s+/g, " ").slice(0, 140)}</small>
            </span>
            <time dateTime={m.date ?? undefined}>{fullTime(m.date)}</time>
          </button>
          {expanded && <>
            <MessageFrame html={m.html} text={m.text} title={`Message from ${senderName(from)}`} />
            {m.attachments.some((a) => !a.inline) && <ul className="mg-mail-files" aria-label="Attachments">
              {m.attachments.filter((a) => !a.inline).map((a) => {
                const href = `/mail/attachment?${new URLSearchParams({ account: accountId, mailbox: m.mailbox, uid: String(m.uid), i: String(a.index) })}`;
                return <li key={a.index}><a className="mg-pill" href={href} download={a.filename}><FileArrowDown size={14} aria-hidden="true" /><span>{a.filename}</span><small>{fileSize(a.size)}</small></a><AdvertAttachment href={href} filename={a.filename} type={a.contentType} size={a.size} seconds={bookedSeconds} /></li>;
              })}
            </ul>}
          </>}
        </li>;
      })}
    </ol>
    {children}
  </article>;
}

function ReaderSkeleton() {
  return <div className="mg-mail-skeleton mg-mail-skeleton-reader"><span /><span /><span /><span /></div>;
}
