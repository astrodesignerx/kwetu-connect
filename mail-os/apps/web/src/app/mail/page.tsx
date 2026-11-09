"use client";

import { ErrorState } from "@/components/empty-state";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatShortDate, formatWhen, plural } from '@/lib/format';
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadDetailDto, ThreadSummaryDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button, ErrorText, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { initialsFor } from "@/lib/avatar";
import { frameDocument } from "@/lib/mail-frame";
import s from './page.module.css';
import { signalMail } from '@/lib/signal-mail';
import type { MailThreadDetail as SignalThreadDetail } from '@/lib/signal-mail';
import { ClientAvatar, Segmented } from '@/components/signal';
import { ThreadList } from '@/components/mail/thread-list';
import { MorningBrief } from '@/components/mail/morning-brief';
import { ConversationContext, ConversationChips } from '@/components/mail/conversation-context';
import { ComposeModal, replyContextFromThread, type ComposeContext } from "@/components/compose";
import { ThreadSummary } from "@/components/ai-panel";
import { MailDisclosure } from "@/components/mail/disclosure";
import { AttachmentList } from "@/components/attachments";
import { ContactDetails } from "@/components/contact-card";
import { ReplyDock } from "@/components/reply-dock";
import {
  Archive,
  ArrowLeft,
  Check,
  Minus,
  ChevronRight,
  CornerUpLeft,
  Mail,
  MailOpen,
  Paperclip,
  Trash2,
} from "lucide-react";

const PAGE_SIZE = 50;

/**
 * Folder names, for the list toolbar's heading. The folders themselves live in
 * the navigation rail now, as they are locations and a location belongs in the
 * column that answers "where am I", not in the header of the list it produced.
 */
const FOLDER_LABELS: Record<string, string> = {
  inbox: "Inbox",
  unread: "Unread",
  assigned: "Assigned",
  sent: "Sent",
  archive: "Archive",
  all: "All mail",
};

type FolderKey = keyof typeof FOLDER_LABELS;

export default function MailPage() {
  return (
    <Suspense fallback={<div className={s.quiet}>Loading mail...</div>}>
      <MailView />
    </Suspense>
  );
}

function MailView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const folder = (searchParams.get("folder") as FolderKey) ?? "inbox";
  const threadId = searchParams.get("id") ?? null;
  // Search is owned by the top bar and expressed entirely in the URL, so there is
  // no second copy of the query here to drift out of step with the address bar.
  const activeQuery = searchParams.get("q")?.trim() || undefined;

  const { data: overview, isError: overviewError, refetch: reloadOverview } = useQuery({
    queryKey: ["overview"],
    queryFn: api.mailOverview,
    enabled: !!token,
  });
  const mailboxes = overview?.mailboxes ?? [];
  const currentMailboxId = searchParams.get("m") ?? mailboxes[0]?.id ?? null;
  const currentMailbox = mailboxes.find((m) => m.id === currentMailboxId);

  /**
   * Applies every change in one navigation.
   *
   * Two sequential single-key calls both build from the same searchParams snapshot,
   * so the second silently discards the first. That is why the filter tabs did
   * nothing: switching folder also clears the open thread, and the clear-id call
   * overwrote the folder change, leaving the URL on the default Inbox every time.
   */
  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const setParam = (key: string, value: string | null) => setParams({ [key]: value });

  // Paged rather than a single call: the API caps a page at 200 and defaulted to 50,
  // so with real history everything past the first page was simply unreachable.
  const {
    data: threadPages,
    isLoading: threadsLoading,
    isError: threadsError,
    refetch: refetchThreads,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["threads", currentMailboxId, folder, activeQuery],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      signalMail.listThreads({
        connectionId: currentMailboxId!,
        folder,
        q: activeQuery,
        mine: folder === "assigned" || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? all.length : undefined;
    },
    enabled: !!currentMailboxId,
  });

  const threadItems = useMemo(
    () => threadPages?.pages.flatMap((p) => p.items) ?? [],
    [threadPages]
  );
  const threadTotal = threadPages?.pages[0]?.total ?? 0;

  const { data: thread, isError: threadError, refetch: refetchThread } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => signalMail.getThread(threadId!),
    enabled: !!threadId,
  });

  const threadMailbox = mailboxes.find((mailbox) => mailbox.id === thread?.mailboxConnectionId) ?? currentMailbox;

  const setRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => api.setThreadRead(id, read),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["thread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
    },
  });

  const move = useMutation({
    mutationFn: ({ id, target }: { id: string; target: "Archive" | "Trash" }) =>
      api.moveThread(id, target),
    onSuccess: () => {
      setParam("id", null);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
    },
  });

  const syncNow = useMutation({ mutationFn: (id: string) => api.triggerMailboxSync(id) });

  const markUnread = () => {
    if (!threadId) return;
    setParam("id", null);
    setRead.mutate({ id: threadId, read: false });
  };

  // Mark a thread read the first time it's opened.
  useEffect(() => {
    if (thread && thread.hasUnread && threadId) {
      setRead.mutate({ id: threadId, read: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, thread?.hasUnread]);

  const selected = useMemo(
    () => threadItems.find((t) => t.id === threadId),
    [threadItems, threadId]
  );

  const [compose, setCompose] = useState<ComposeContext | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  /**
   * A half-written reply belongs to the thread it answers, so the dock's open
   * state is stored as *which* thread is being replied to rather than as a
   * boolean that would have to be reset every time the selection moves.
   */
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const replyOpen = replyingTo !== null && replyingTo === threadId;
  const setReplyOpen = (open: boolean) => setReplyingTo(open ? threadId : null);

  /**
   * The rail's compose button lives outside this component, so it asks for the
   * composer through the URL rather than through a store the two would have to
   * share. Read straight through rather than copied into state on mount: the
   * sheet then survives a reload, and there is no window in which the flag is
   * set but the sheet is not yet open.
   */
  const composeFromUrl = searchParams.get("compose") === "1";
  const composeCtx: ComposeContext | null =
    compose ??
    (composeFromUrl && currentMailboxId
      ? { mode: "new", connectionId: currentMailboxId }
      : null);

  // Selection is intersected with what is currently listed rather than cleared by an
  // effect when the filter changes. Ids that scrolled out of scope are ignored, so a
  // bulk action can never reach a row you can no longer see.
  const visibleSelection = useMemo(() => {
    const visible = new Set(threadItems.map((t) => t.id));
    return new Set([...selection].filter((id) => visible.has(id)));
  }, [selection, threadItems]);

  const toggleSelect = (id: string) =>
    setSelection((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkArchive = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.moveThread(id, "Archive");
    },
    onSuccess: () => {
      setSelection(new Set());
      setParam("id", null);
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
    },
  });

  // Keyboard navigation. A mail client is used all day; reaching for the mouse to
  // move down a list is the single biggest ergonomic cost. Search ("/") and the
  // shortcut sheet ("?") are global and handled by the shell.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The composer is modal and owns the keyboard while it is open; otherwise
      // typing "e" into a reply archives the thread behind it.
      if (composeCtx || document.querySelector("dialog[open]")) return;

      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if (e.key === "Escape") {
        if (typing) (el as HTMLInputElement).blur();
        else if (visibleSelection.size) setSelection(new Set());
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const index = threadItems.findIndex((t) => t.id === threadId);
      const go = (i: number) => {
        const next = threadItems[Math.max(0, Math.min(threadItems.length - 1, i))];
        if (next) setParam("id", next.id);
      };

      switch (e.key) {
        case "j": e.preventDefault(); go(index < 0 ? 0 : index + 1); break;
        case "k": e.preventDefault(); go(index < 0 ? 0 : index - 1); break;
        case "x":
          if (threadId) { e.preventDefault(); toggleSelect(threadId); }
          break;
        case "e":
          e.preventDefault();
          if (visibleSelection.size) bulkArchive.mutate([...visibleSelection]);
          else if (threadId) move.mutate({ id: threadId, target: "Archive" });
          break;
        case "u":
          if (threadId) { e.preventDefault(); markUnread(); }
          break;
        case "r":
          // Answering happens where you are reading. The full sheet is one click
          // away from the dock when the reply needs more than words.
          if (thread) { e.preventDefault(); setReplyOpen(true); }
          break;
        case "c":
          if (currentMailboxId) {
            e.preventDefault();
            setCompose({ mode: "new", connectionId: currentMailboxId });
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (overviewError) return <div className={s.noMailbox}><ErrorState title="Mailboxes could not load" message="Check your connection, then try again" onRetry={() => void reloadOverview()} /></div>;

  if (mailboxes.length === 0 && overview) {
    return <NoMailboxes />;
  }

  return (
    <div className={s.root}>
      {(move.isError || bulkArchive.isError || setRead.isError) && <div className={s.actionError}><ErrorText>The mail action could not finish. Try again using its control.</ErrorText></div>}
      <div className={`${s.workspace} scroll-cue`} data-conversation={!!threadId} data-search={!!activeQuery}>
        {threadId && (
          threadError ? <ErrorState className={s.readerState} title="Could not open this conversation" message="It may have moved. Try again or go back to the inbox." action={<div className={s.errorActions}><Button variant="default" onClick={() => void refetchThread()}>Try again</Button><Button variant="ghost" onClick={() => setParam('id', null)}>Back to inbox</Button></div>} /> :
          <Reader thread={thread} selected={selected} mailboxId={thread?.mailboxConnectionId ?? currentMailboxId} mailboxEmail={threadMailbox?.email}
            syncError={threadMailbox?.syncError ?? null} onRetrySync={() => threadMailbox && syncNow.mutate(threadMailbox.id)} retrying={syncNow.isPending}
            onMarkUnread={markUnread}
            onArchive={() => threadId && move.mutate({ id: threadId, target: 'Archive' })}
            onDelete={() => threadId && move.mutate({ id: threadId, target: 'Trash' })} moving={move.isPending}
            replyOpen={replyOpen} onReplyOpenChange={setReplyOpen} onExpandReply={setCompose}
            draftHtml={replyDrafts[threadId] ?? ''} onDraftChange={(html) => setReplyDrafts((drafts) => ({ ...drafts, [threadId]: html }))}
            onCompose={() => currentMailboxId && setCompose({ mode: 'new', connectionId: currentMailboxId })}
            onBack={() => setParam('id', null)} />
        )}
          <section className={`${s.list} scroll-cue`} aria-label={activeQuery ? 'Search results' : 'Messages'}>
            {activeQuery ? <><h1 className={s.searchHeading}>{activeQuery}</h1><div className={s.searchTools}><button aria-pressed="true">Conversations {threadTotal}</button><button onClick={() => setParams({ q: null, id: null })}>Clear search</button></div></> :
              <div className={s.listHead}><h1 className={s.heading}>{FOLDER_LABELS[folder] ?? 'Mail'}</h1>
                <Segmented options={[{ value: 'inbox', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'assigned', label: 'Assigned' }]}
                  value={folder === 'unread' || folder === 'assigned' ? folder : 'inbox'} onChange={(value) => setParams({ folder: value, id: null })} label="Filter messages" />
              </div>}
            <ListToolbar total={threadTotal} loading={threadsLoading} items={threadItems} selection={visibleSelection}
              onSelectAll={(all) => setSelection(all ? new Set(threadItems.map((item) => item.id)) : new Set())}
              onBulkArchive={() => bulkArchive.mutate([...visibleSelection])} bulkBusy={bulkArchive.isPending} />
            {threadsError ? <ErrorState bare title="Messages could not load" onRetry={() => void refetchThreads()} /> :
              <ThreadList items={threadItems} loading={threadsLoading} selectedId={threadId} onSelect={(id) => setParam('id', id)} selection={visibleSelection}
                onToggleSelect={toggleSelect} total={threadTotal} hasMore={!!hasNextPage} loadingMore={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} query={activeQuery} />}
          </section>
          {!threadId && !activeQuery && <MorningBrief />}
      </div>

      {composeCtx && (
        <ComposeModal
          ctx={composeCtx}
          onClose={() => {
            setCompose(null);
            if (composeFromUrl) setParam("compose", null);
          }}
        />
      )}
    </div>
  );
}

function NoMailboxes() {
  return (
    <div className={s.noMailbox}>
      <EmptyState icon={Mail} title="No mailbox connected"
        text="Connect your cPanel mailbox and your mail syncs into this workspace"
        action={<Link href="/settings/mailboxes/connect" className={buttonClass()}>Connect a mailbox</Link>} />
    </div>
  );
}

function ListToolbar({ total, loading, items, selection, onSelectAll, onBulkArchive, bulkBusy }: {
  total: number; loading: boolean; items: ThreadSummaryDto[]; selection: Set<string>; onSelectAll: (all: boolean) => void; onBulkArchive: () => void; bulkBusy: boolean;
}) {
  const allSelected = items.length > 0 && selection.size === items.length;
  return <div className={s.bulkToolbar}>
    <button type="button" role="checkbox" aria-checked={allSelected ? true : selection.size > 0 ? 'mixed' : false} aria-label={allSelected ? 'Deselect all threads' : 'Select all threads'}
      disabled={!items.length} onClick={() => onSelectAll(!allSelected)} className={s.selectionBox}>{allSelected ? <Check size={14} aria-hidden /> : selection.size ? <Minus size={14} aria-hidden /> : null}</button>
    <span>{selection.size ? selection.size + ' selected' : loading ? 'Loading' : plural(total, 'conversation')}</span>
    {selection.size > 0 && <><button type="button" disabled={bulkBusy} onClick={onBulkArchive}>{bulkBusy ? 'Archiving...' : 'Archive'}</button><button type="button" onClick={() => onSelectAll(false)}>Clear selection</button></>}
  </div>;
}

function Reader({ thread, selected, mailboxId, syncError, onRetrySync, retrying, onMarkUnread, onArchive, onDelete, moving, replyOpen, onReplyOpenChange, onExpandReply, onBack, draftHtml, onDraftChange }: {
  thread: SignalThreadDetail | undefined; selected: ThreadSummaryDto | undefined; mailboxId: string | null; mailboxEmail?: string; syncError: string | null;
  onRetrySync: () => void; retrying: boolean; onMarkUnread: () => void; onArchive: () => void; onDelete: () => void; moving: boolean;
  replyOpen: boolean; onReplyOpenChange: (open: boolean) => void; onExpandReply: (ctx: ComposeContext) => void; onCompose: () => void; onBack: () => void;
  draftHtml: string; onDraftChange: (html: string) => void;
}) {
  if (!thread) return <div className={`${s.quiet} ${s.readerState}`} role="status">{selected ? 'Opening conversation...' : 'Loading conversation...'}</div>;
  const latest = thread.messages[thread.messages.length - 1];
  return <div className={`${s.conversation} scroll-cue`} key={thread.id}>
    <article className={s.reader}>
      <div className={s.readerTop}>
        <button type="button" className={s.backButton} onClick={onBack} aria-label="Back to inbox"><ArrowLeft size={16} aria-hidden /></button>
        <ConversationChips threadId={thread.id} />
        <time dateTime={thread.lastDate ?? undefined}>{formatShortDate(thread.lastDate)}</time>
      </div>
      <h1>{thread.subject || '(no subject)'}</h1>
      {syncError && <div className={s.syncError}><ErrorText>This mailbox stopped syncing: {syncError}</ErrorText><Button variant="default" size="small" onClick={onRetrySync} disabled={retrying}>Retry</Button></div>}
      <ThreadSummary threadId={thread.id} onNextStep={() => onReplyOpenChange(true)} />
      <Participants thread={thread} latest={latest} mailboxId={mailboxId} actions={<>
        <button type="button" className="reader-action" onClick={() => onReplyOpenChange(true)}><CornerUpLeft size={16} aria-hidden />Reply</button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onMarkUnread} aria-label="Mark unread" title="Mark unread"><MailOpen size={16} aria-hidden /></button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onArchive} disabled={moving} aria-label="Archive" title="Archive"><Archive size={16} aria-hidden /></button>
        <button type="button" className={`reader-action ${s.iconAction}`} onClick={onDelete} disabled={moving} aria-label="Delete" title="Delete"><Trash2 size={16} aria-hidden /></button>
      </>} />
      {thread.messages.map((message, index) => <MessageCard key={message.id} message={message} index={index} defaultOpen={index === thread.messages.length - 1} showSender={index !== thread.messages.length - 1} clientId={thread.clientId} />)}
      {mailboxId && <ReplyDock thread={thread} connectionId={mailboxId} open={replyOpen} onOpenChange={onReplyOpenChange} draftHtml={draftHtml} onDraftChange={onDraftChange} className={s.dock} onExpand={(ctx) => { onReplyOpenChange(false); onExpandReply(ctx); }} />}
    </article>
    <ConversationContext threadId={thread.id} replyState={thread.replyState} stateSince={thread.stateSince} needsNudge={thread.needsNudge}
      onQuickReply={mailboxId ? (template) => onExpandReply({ ...replyContextFromThread(mailboxId, thread), prefillBody: template.bodyHtml ?? '', skipBrandWrap: template.skipBrandWrap }) : undefined} />
  </div>;
}

/**
 * Sender, recipients and the thread's date, between the summary and the messages.
 *
 * "Details" is one disclosure covering everything about the addressing: who it is
 * from, who it went to, who was copied, and what the app knows about that
 * correspondent. Those answers used to be split between a popover on the avatar
 * and a line in the message header, so finding a Cc meant expanding a message.
 */
function Participants({
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

/** One labelled address line. Rendered only when there is something to show. */
function AddressRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function formatAddress(name: string | null | undefined, addr: string | null | undefined) {
  if (name && addr) return `${name} <${addr}>`;
  return addr ?? name ?? null;
}

function MessageCard({ message, index, defaultOpen, showSender }: { message: ThreadDetailDto['messages'][number]; index: number; defaultOpen: boolean; showSender: boolean; clientId?: string | null }) {
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
    <MailDisclosure open={open}><div className={s.messageBody}>
      {message.bodyHtml ? <MessageBody html={message.bodyHtml} index={index} /> : <pre>{message.bodyText || '(no content)'}</pre>}
      <AttachmentList attachments={message.attachments ?? []} hasAttachments={message.hasAttachments} metaJson={message.attachmentMetaJson} />
    </div></MailDisclosure>
  </article>;
}

// The frame document, its injected stylesheet and the remote-content block moved to
// `@/lib/mail-frame` when the composer needed the same protections for its preview
// and quoted history.

function MessageBody({ html, index }: { html: string; index: number }) {
  const [showRemote, setShowRemote] = useState(false);
  const [tall, setTall] = useState(false);
  const hasRemote = /(?:src|background)\s*=\s*["']?https?:/i.test(html);

  return (
    <div>
      {hasRemote && !showRemote && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-control border border-fg bg-raise px-3 py-2">
          <span className="text-xs text-muted">
            Remote images blocked to prevent read tracking.
          </span>
          <button
            type="button"
            onClick={() => setShowRemote(true)}
            className="rounded-tag border border-fg px-2 py-0.5 text-xs font-semibold transition-[transform,opacity] duration-120 ease-standard hover:opacity-64"
          >
            Show images
          </button>
        </div>
      )}
      <iframe
        title={`Message ${index + 1}`}
        srcDoc={frameDocument(html, !showRemote)}
        className={cn(
          "w-full rounded-control border border-line bg-paper ",
          tall ? "h-[70vh]" : "h-80"
        )}
        sandbox=""
      />
      {/* The frame cannot measure its own content: sandbox="" denies scripts, and
          relaxing that for srcdoc would hand the message same-origin access to the
          app. So the reader offers the height instead of guessing it. */}
      <button
        type="button"
        onClick={() => setTall((v) => !v)}
        className="mt-1 rounded-tag px-2 py-0.5 text-xs font-medium text-muted transition-[transform,opacity] duration-120 ease-standard hover:opacity-64"
      >
        {tall ? "Shrink message" : "Expand message"}
      </button>
    </div>
  );
}

