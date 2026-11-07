"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ThreadDetailDto, ThreadSummaryDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui";
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
  assigned: "Assigned to me",
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

  if (overviewError) return <div className={s.quiet} role="alert">Mailboxes could not load. <button onClick={() => void reloadOverview()}>Try again</button></div>;

  if (mailboxes.length === 0 && overview) {
    return <NoMailboxes />;
  }

  return (
    <div className={s.root}>
      {(move.isError || bulkArchive.isError || setRead.isError) && <p className={s.quiet} role="alert">The mail action could not finish. Try again using its control.</p>}
      <div className={s.workspace} data-conversation={!!threadId} data-search={!!activeQuery}>
        {threadId && (
          threadError ? <div className={`${s.quiet} ${s.readerState}`} role="alert">Could not open this conversation. <button onClick={() => void refetchThread()}>Try again</button><button onClick={() => setParam('id', null)}>Back to inbox</button></div> :
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
          <section className={s.list} aria-label={activeQuery ? 'Search results' : 'Messages'}>
            {activeQuery ? <><h1 className={s.searchHeading}>{activeQuery}</h1><div className={s.searchTools}><button aria-pressed="true">Conversations {threadTotal}</button><button onClick={() => setParams({ q: null, id: null })}>Clear search</button></div></> :
              <div className={s.listHead}><h1 className={s.heading}>{FOLDER_LABELS[folder] ?? 'Mail'}</h1>
                <Segmented options={[{ value: 'inbox', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'assigned', label: 'Assigned' }]}
                  value={folder === 'unread' || folder === 'assigned' ? folder : 'inbox'} onChange={(value) => setParams({ folder: value, id: null })} label="Filter messages" />
              </div>}
            <ListToolbar total={threadTotal} items={threadItems} selection={visibleSelection}
              onSelectAll={(all) => setSelection(all ? new Set(threadItems.map((item) => item.id)) : new Set())}
              onBulkArchive={() => bulkArchive.mutate([...visibleSelection])} bulkBusy={bulkArchive.isPending} />
            {threadsError ? <div className={s.quiet} role="alert">Messages could not load. <button onClick={() => void refetchThreads()}>Try again</button></div> :
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
    <div className="flex min-w-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <EmptyMailArt className={`mx-auto mb-4 ${s.emptyMail}`} />
        <h2 className="text-base font-semibold">No mailbox connected yet</h2>
        <p className="mt-1 text-sm text-brand-black/60 dark:text-brand-cream/60">
          Connect your cPanel mailbox and the last few years of mail will sync into
          this workspace.
        </p>
        <Link href="/settings/mailboxes" className="btn-primary mt-4 inline-flex">
          Connect a mailbox
        </Link>
      </div>
    </div>
  );
}

function ListToolbar({ total, items, selection, onSelectAll, onBulkArchive, bulkBusy }: {
  total: number; items: ThreadSummaryDto[]; selection: Set<string>; onSelectAll: (all: boolean) => void; onBulkArchive: () => void; bulkBusy: boolean;
}) {
  const allSelected = items.length > 0 && selection.size === items.length;
  return <div className={s.bulkToolbar}>
    <button type="button" role="checkbox" aria-checked={allSelected ? true : selection.size > 0 ? 'mixed' : false} aria-label={allSelected ? 'Deselect all threads' : 'Select all threads'}
      disabled={!items.length} onClick={() => onSelectAll(!allSelected)} className={s.selectionBox}>{allSelected ? <Check size={12} aria-hidden /> : selection.size ? <Minus size={12} aria-hidden /> : null}</button>
    <span>{selection.size ? selection.size + ' selected' : total + ' conversations'}</span>
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
  const who = latest?.fromName || latest?.fromAddr || 'Unknown sender';
  return <div className={s.conversation} key={thread.id}>
    <article className={s.reader}>
      <div className={s.readerTop}>
        <button type="button" className={s.backButton} onClick={onBack} aria-label="Back to inbox"><ArrowLeft size={16} aria-hidden /></button>
        <ConversationChips threadId={thread.id} />
        <time>{thread.lastDate ? new Date(thread.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</time>
      </div>
      <header className={s.sender}>
        <span className={s.senderAvatar} aria-hidden>{initialsFor(who)}</span>
        <b>{who}</b><span>{latest?.fromAddr}</span>
      <div className={s.actions}>
        <Button variant="ghost" onClick={() => onReplyOpenChange(true)}><CornerUpLeft size={14} />Reply</Button>
        <Button variant="ghost" onClick={onMarkUnread} aria-label="Mark unread"><MailOpen size={16} /></Button>
        <Button variant="ghost" onClick={onArchive} disabled={moving} aria-label="Archive"><Archive size={16} /></Button>
        <Button variant="ghost" onClick={onDelete} disabled={moving} aria-label="Delete"><Trash2 size={16} /></Button>
      </div>
      </header>
      {syncError && <div className={s.quiet} role="alert">This mailbox stopped syncing: {syncError} <Button variant="ghost" onClick={onRetrySync} disabled={retrying}>Retry</Button></div>}
      <h1>{thread.subject || '(no subject)'}</h1>
      <ThreadSummary threadId={thread.id} onNextStep={() => onReplyOpenChange(true)} />
      <Participants thread={thread} latest={latest} mailboxId={mailboxId} />
      {thread.messages.map((message, index) => <MessageCard key={message.id} message={message} index={index} defaultOpen={index === thread.messages.length - 1} clientId={thread.clientId} />)}
      {mailboxId && <ReplyDock thread={thread} connectionId={mailboxId} open={replyOpen} onOpenChange={onReplyOpenChange} draftHtml={draftHtml} onDraftChange={onDraftChange} onExpand={(ctx) => { onReplyOpenChange(false); onExpandReply(ctx); }} />}
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
}: {
  thread: ThreadDetailDto;
  latest: ThreadDetailDto["messages"][number] | undefined;
  mailboxId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const who = latest?.fromName || latest?.fromAddr || "Unknown";

  return (
    <section className="reader-participants">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="avatar-initials h-9 w-9 text-[12px]"
          style={{ background: 'var(--raise)' }}
        >
          {initialsFor(who)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{who}</div>
          <div className="truncate text-[11px] text-brand-black/55 dark:text-brand-cream/50">
            {latest?.fromAddr ?? "(no address)"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="reader-action shrink-0 !px-2 !py-1 !text-[11px]"
        >
          Details
          <ChevronRight
            aria-hidden
            size={12}
            className={cn("transition-transform duration-200 ease-out", open && "rotate-90")}
          />
        </button>

        <span className="shrink-0 text-[11px] tabular-nums text-brand-black/50 dark:text-brand-cream/45">
          {thread.lastDate
            ? new Date(thread.lastDate).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : ""}
        </span>
      </div>

      <MailDisclosure open={open}>
        <div className="detail-panel mt-2.5 border-t border-brand-black/[0.07] pt-2.5 dark:border-brand-cream/[0.07]">
          <dl className="mb-2 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
            <AddressRow label="From" value={formatAddress(latest?.fromName, latest?.fromAddr)} />
            <AddressRow label="To" value={latest?.toAddrs} />
            <AddressRow label="Cc" value={latest?.ccAddrs} />
            <AddressRow
              label="Date"
              value={latest?.date ? new Date(latest.date).toLocaleString() : null}
            />
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
      <dt className="font-semibold text-brand-black/45 dark:text-brand-cream/40">{label}</dt>
      <dd className="min-w-0 break-words text-brand-black/75 dark:text-brand-cream/70">{value}</dd>
    </>
  );
}

function formatAddress(name: string | null | undefined, addr: string | null | undefined) {
  if (name && addr) return `${name} <${addr}>`;
  return addr ?? name ?? null;
}

function MessageCard({ message, index, defaultOpen }: { message: ThreadDetailDto['messages'][number]; index: number; defaultOpen: boolean; clientId?: string | null }) {
  const [open, setOpen] = useState(defaultOpen);
  const who = message.fromName || message.fromAddr || 'Unknown';
  return <article className={s.message}>
    <button type="button" className={s.messageHead} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <ClientAvatar name={who} colour="var(--muted)" size="small" />
      <span><span className="block truncate text-sm font-semibold">{who}</span><span className={s.snippet}>{open ? 'to ' + (message.toAddrs || '(no recipients)') : message.snippet || '(no preview)'}</span></span>
      {message.hasAttachments && <Paperclip size={12} aria-label="Has attachments" />}
      <time>{message.date ? new Date(message.date).toLocaleDateString('en-GB') : ''}</time>
      <ChevronRight size={14} aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--t2) var(--ease)' }} />
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
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-amber/30 bg-brand-amber/[0.08] px-2.5 py-1.5">
          <span className="text-xs text-brand-black/70 dark:text-brand-cream/70">
            Remote images blocked to prevent read tracking.
          </span>
          <button
            type="button"
            onClick={() => setShowRemote(true)}
            className="rounded-md border border-brand-amber/40 px-2 py-0.5 text-[11px] font-semibold transition-colors duration-150 ease-out hover:bg-brand-amber/20"
          >
            Show images
          </button>
        </div>
      )}
      <iframe
        title={`Message ${index + 1}`}
        srcDoc={frameDocument(html, !showRemote)}
        className={cn(
          "w-full rounded-lg border border-brand-black/10 bg-white dark:border-brand-cream/10",
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
        className="mt-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-black/60 transition-colors duration-150 ease-out hover:bg-brand-black/5 hover:text-brand-black dark:text-brand-cream/55 dark:hover:bg-brand-cream/10 dark:hover:text-brand-cream"
      >
        {tall ? "Shrink message" : "Expand message"}
      </button>
    </div>
  );
}

/**
 * Empty-state art: a stack of envelopes, the newest lifted off the pile.
 *
 * The reader's empty state used to be the character "▤" at 30% opacity, which
 * reads as a rendering failure rather than as "nothing selected yet". Drawn
 * inline rather than shipped as an asset. It is nine shapes, and it has to pick
 * up the brand amber and the current text colour in both themes.
 */
function EmptyMailArt({ className, small }: { className?: string; small?: boolean }) {
  const w = small ? 76 : 116;
  return (
    <svg
      width={w}
      height={w * 0.72}
      viewBox="0 0 116 84"
      fill="none"
      aria-hidden
      className={className}
    >
      <g className="text-brand-black/15 dark:text-brand-cream/15">
        <rect x="14" y="30" width="88" height="50" rx="7" fill="currentColor" />
        <rect x="8" y="22" width="100" height="52" rx="7" fill="currentColor" />
      </g>
      <rect
        x="20"
        y="10"
        width="76"
        height="52"
        rx="7"
        className="fill-white dark:fill-brand-black"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <path
        d="M20 18l33.5 24a8 8 0 009 0L96 18"
        stroke="var(--color-brand-amber)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="96" cy="16" r="7" fill="var(--color-brand-amber)" />
    </svg>
  );
}
