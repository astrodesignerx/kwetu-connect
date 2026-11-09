# Phase 4 one-off: the reader says the sender once, in one compact row.
# Run from mail-os/apps/web.
p = 'src/app/mail/page.tsx'
s = open(p, encoding='utf-8').read()

old_top = s[s.index('      <header className={s.sender}>'):s.index('      {mailboxId && <ReplyDock')]
new_top = '''      <h1>{thread.subject || '(no subject)'}</h1>
      {syncError && <div className={s.quiet} role="alert">This mailbox stopped syncing: {syncError} <Button variant="ghost" onClick={onRetrySync} disabled={retrying}>Retry</Button></div>}
      <ThreadSummary threadId={thread.id} onNextStep={() => onReplyOpenChange(true)} />
      <Participants thread={thread} latest={latest} mailboxId={mailboxId} actions={<>
        <button type="button" className="reader-action" onClick={() => onReplyOpenChange(true)}><CornerUpLeft size={16} aria-hidden />Reply</button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onMarkUnread} aria-label="Mark unread" title="Mark unread"><MailOpen size={16} aria-hidden /></button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onArchive} disabled={moving} aria-label="Archive" title="Archive"><Archive size={16} aria-hidden /></button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onDelete} disabled={moving} aria-label="Delete" title="Delete"><Trash2 size={16} aria-hidden /></button>
      </>} />
      {thread.messages.map((message, index) => <MessageCard key={message.id} message={message} index={index} defaultOpen={index === thread.messages.length - 1} showSender={index !== thread.messages.length - 1} clientId={thread.clientId} />)}
'''
s = s.replace(old_top, new_top)
s = s.replace("  const who = latest?.fromName || latest?.fromAddr || 'Unknown sender';\n  return <div className={`${s.conversation} scroll-cue`} key={thread.id}>", "  return <div className={`${s.conversation} scroll-cue`} key={thread.id}>")

old_part = s[s.index('function Participants({'):s.index('/** One labelled address line.')]
new_part = '''function Participants({
  thread,
  latest,
  mailboxId,
  actions,
}: {
  thread: ThreadDetailDto;
  latest: ThreadDetailDto["messages"][number] | undefined;
  mailboxId: string | null;
  actions: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const who = latest?.fromName || latest?.fromAddr || "Unknown sender";

  return (
    <section className={s.senderRow} aria-label="Sender">
      <div className={s.senderLine}>
        <span aria-hidden className={s.senderAvatar}>{initialsFor(who)}</span>
        <div className={s.senderText}>
          <b>{who}</b>
          <span>{latest?.fromAddr ?? "(no address)"}</span>
        </div>
        <div className={s.actions}>
          {actions}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="reader-action"
          >
            Details
            <ChevronRight aria-hidden size={14} className={s.chevron} data-open={open} />
          </button>
        </div>
      </div>

      <MailDisclosure open={open}>
        <div className={`detail-panel ${s.details}`}>
          <dl className={s.addressGrid}>
            <AddressRow label="From" value={formatAddress(latest?.fromName, latest?.fromAddr)} />
            <AddressRow label="To" value={latest?.toAddrs} />
            <AddressRow label="Cc" value={latest?.ccAddrs} />
            <AddressRow label="Date" value={latest?.date ? formatDateTime(latest.date) : null} />
          </dl>
          <ContactDetails
            threadId={thread.id}
            address={latest?.fromAddr ?? null}
            mailboxId={mailboxId}
          />
        </div>
      </MailDisclosure>
    </section>
  );
}

'''
s = s.replace(old_part, new_part)

s = s.replace('''      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-muted">{value}</dd>''', '''      <dt>{label}</dt>
      <dd>{value}</dd>''')

old_card = s[s.index('function MessageCard('):]
old_card = old_card[:old_card.index('    <MailDisclosure open={open}>')]
new_card = '''function MessageCard({ message, index, defaultOpen, showSender }: { message: ThreadDetailDto['messages'][number]; index: number; defaultOpen: boolean; showSender: boolean; clientId?: string | null }) {
  const [open, setOpen] = useState(defaultOpen);
  const who = message.fromName || message.fromAddr || 'Unknown';
  const to = 'to ' + (message.toAddrs || '(no recipients)');
  return <article className={s.message}>
    <button type="button" className={s.messageHead} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={showSender ? undefined : `Message ${to}`}>
      {showSender && <ClientAvatar name={who} size="small" />}
      <span className={s.messageWho}>{showSender && <span className={s.messageName}>{who}</span>}<span className={s.messageSnippet}>{open || !showSender ? to : message.snippet || '(no preview)'}</span></span>
      {message.hasAttachments && <Paperclip size={14} aria-label="Has attachments" />}
      <time dateTime={message.date ?? undefined}>{formatWhen(message.date)}</time>
      <ChevronRight size={14} aria-hidden className={s.chevron} data-open={open} />
    </button>
'''
s = s.replace(old_card, new_card)
open(p, 'w', encoding='utf-8').write(s)

c = 'src/app/mail/page.module.css'
css = open(c, encoding='utf-8').read()
start = css.index('.sender {')
end = css.index('.reader > h1')
css = css[:start] + '''.senderRow { margin: 0 0 12px; padding: 12px 0; border-block: 1px solid var(--line); }
.senderLine { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.senderAvatar { display: grid; flex-shrink: 0; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--raise); color: var(--fg); font-size: 12px; line-height: 16px; font-weight: 600; }
.senderText { flex: 1 1 200px; min-width: 0; }
.senderText b, .senderText span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.senderText b { font-size: 14px; line-height: 20px; font-weight: 600; }
.senderText span { color: var(--muted); font-size: 13px; line-height: 20px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-left: auto; }
.iconAction { width: 32px; padding: 0; justify-content: center; }
.chevron { transition: transform var(--t2) var(--ease); }
.chevron[data-open=true] { transform: rotate(90deg); }
.details { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
''' + css[end:]
css = css.replace('.reader > h1 { margin: 20px 0 12px;', '.reader > h1 { margin: 16px 0 12px;')
for rule in ['  .sender { margin-inline: -20px; }\n', '  .sender { margin-inline: -16px; }\n', '.participants { margin-bottom: 12px; }\n', '.participantBar { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); }\n']:
    css = css.replace(rule, '')
open(c, 'w', encoding='utf-8').write(css)
print('ok')
