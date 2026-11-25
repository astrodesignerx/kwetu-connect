"use client";
import type { MailAction, ThreadMessage } from "@/app/mail/actions";
import type { Special } from "@/lib/mail/client";
import MessageFrame from "./MessageFrame";
import AdvertAttachment from "./AdvertAttachment";
import MailIcon from "./MailIcon";
import { fileSize, fullTime, initials, senderName } from "./mail-format";

export type ReplyKind = "reply" | "replyAll" | "forward";
export default function MailReader({ accountId, special, messages, loading, error, flagged, onAct, onReply, replyPrimary = true, onBack, onRetry, children, chips, bookedSeconds, onDone, done, waiting, onInspector, inspector }: {
  accountId: string; special: Special; messages: ThreadMessage[]; loading: boolean; error: string | null; flagged: boolean;
  onAct: (action: MailAction) => void; onReply: (kind: ReplyKind, message: ThreadMessage) => void; onBack: () => void; onRetry: () => void;
  replyPrimary?: boolean; children?: React.ReactNode; chips?: React.ReactNode; bookedSeconds?: number; onDone?: () => void; done?: boolean; waiting?: boolean; onInspector?: () => void; inspector?: boolean;
}) {
  const latest = messages.at(-1);
  if (error && !latest) return <div className="empty-state" role="alert"><div><p>{error}</p><button type="button" className="btn line" onClick={onRetry}>Try again</button></div></div>;
  if (!latest) return <div className="empty-state" aria-busy={loading}>{loading ? <div className="mg-mail-skeleton mg-mail-skeleton-reader"><span /><span /><span /></div> : <p>Choose a conversation to read it here.</p>}</div>;
  const button = (icon: string, label: string, action: () => void, key?: string, extra = "") => <button type="button" className={`btn ghost icon ${extra}`} onClick={action} aria-label={label} title={label + (key ? `  ${key}` : "")}><MailIcon name={icon} /></button>;
  const message = (m: ThreadMessage) => { const from = m.from[0] ?? {name:"",address:""}; return <div className="mail-message" key={`${m.mailbox}:${m.uid}`}>
    <div className="msg-head"><span className="av">{initials(from.name,from.address)}</span><div className="who"><b>{senderName(from)}</b><span>{from.address} to {m.to.map(senderName).join(", ")}{m.cc.length ? `, copy ${m.cc.map(senderName).join(", ")}` : ""}</span></div><time className="mono" dateTime={m.date ?? undefined}>{fullTime(m.date)}</time></div>
    <MessageFrame html={m.html} text={m.text} remoteContent={m.remoteContent} title={`Message from ${senderName(from)}`} />
    {m.attachments.some((a) => !a.inline) && <div className="atts"><span className="atts-h">{m.attachments.filter((a) => !a.inline).length === 1 ? "1 attachment" : `${m.attachments.filter((a) => !a.inline).length} attachments`}</span><div className="att-row">{m.attachments.filter((a) => !a.inline).map((a) => {
      const href = `/mail/attachment?${new URLSearchParams({account:accountId,mailbox:m.mailbox,uid:String(m.uid),i:String(a.index)})}`;
      return <div key={a.index} className="mail-file"><a className="att" href={href} download={a.filename}><span className={`att-thumb ${a.contentType.startsWith("image/") ? "img" : ""}`}><MailIcon name={a.contentType.startsWith("video/") ? "play" : "image"} /></span><span><b>{a.filename}</b><span>{fileSize(a.size)}</span></span></a><AdvertAttachment href={href} filename={a.filename} type={a.contentType} size={a.size} seconds={bookedSeconds} /></div>;
    })}</div></div>}
  </div>; };
  return <article className="mail-reader" aria-busy={loading} aria-labelledby="mail-subject">
    <header className="toolbar" role="toolbar" aria-label="Conversation actions">
      {button("left","Back to the list",onBack,undefined,"back-btn")}
      <button type="button" className={`btn sm ${replyPrimary ? "gold mg-primary" : "ghost"}`} onClick={() => onReply("reply",latest)}><MailIcon name="reply" size="sm" />Reply</button>
      <button type="button" className="btn ghost sm" onClick={onDone} disabled={!onDone || done} aria-label={done ? "Done" : "Mark done"} title="Mark done  D"><MailIcon name="check" size="sm" /><span className="tb-hide-phone">{done ? "Done" : "Mark done"}</span></button>
      <span className="tb-sep tb-hide-phone" />
      {special === "inbox" ? button("archive","Archive",() => onAct("archive"),"E") : special !== "sent" && button("inbox","Move to inbox",() => onAct("inbox"))}
      {button("star",flagged ? "Remove star" : "Star",() => onAct(flagged ? "unstar" : "star"),"S",flagged ? "tb-star star-on" : "tb-star")}
      <details className="menu-wrap"><summary className="btn ghost sm" aria-label="More conversation actions">
        <span className="tb-more-label">More</span>
        <span className="tb-more-chevron"><MailIcon name="down" size="xs" /></span>
        <span className="tb-more-icon"><MailIcon name="more" size="sm" /></span>
      </summary><div className="menu" role="menu">
        <button type="button" className="tb-narrow" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onAct(flagged ? "unstar" : "star");
        }}>
          <MailIcon name="star" size="sm" />{flagged ? "Remove star" : "Star"}<kbd>S</kbd>
        </button>
        {([["replyAll","replyall","Reply all","A"],["forward","forward","Forward","F"]] as const).map(([kind,icon,label,key]) => <button key={kind} type="button" role="menuitem" onClick={(e) => {e.currentTarget.closest("details")?.removeAttribute("open");onReply(kind,latest);}}><MailIcon name={icon} size="sm" />{label}<kbd>{key}</kbd></button>)}
        <button type="button" role="menuitem" onClick={() => onAct("unread")}><MailIcon name="unread" size="sm" />Mark unread<kbd>U</kbd></button><hr />
        {special !== "spam" && <button type="button" role="menuitem" onClick={() => onAct("spam")}><MailIcon name="spam" size="sm" />Report spam</button>}
        {special !== "trash" && <button type="button" role="menuitem" aria-label="Move to bin" onClick={() => onAct("trash")}><MailIcon name="trash" size="sm" />Delete</button>}
      </div></details><div className="tb-right">{onInspector && <button type="button" className="btn ghost icon" onClick={onInspector} aria-label="Show client and booking" aria-pressed={inspector} title="Inspector  I"><MailIcon name="panel" /></button>}</div>
    </header>
    <div className="main-scroll"><div className="read"><div className="subj"><h2 id="mail-subject">{latest.subject}</h2>{done ? <span className="pill ok">Done</span> : waiting ? <span className="pill ember">Needs reply</span> : null}</div>{chips}
      {messages.length > 1 && <details className="earlier"><summary>{messages.length - 1} earlier message{messages.length > 2 ? "s" : ""}</summary>{messages.slice(0,-1).map((m) => <details key={`${m.mailbox}:${m.uid}`}><summary className="early-msg"><span className="av">{initials(m.from[0]?.name ?? "",m.from[0]?.address ?? "")}</span><span><b>{senderName(m.from[0] ?? {name:"",address:""})}</b>{m.text.slice(0,90)}</span><time className="mono">{fullTime(m.date)}</time></summary>{message(m)}</details>)}</details>}
      {message(latest)}
    </div></div>{children}
  </article>;
}
