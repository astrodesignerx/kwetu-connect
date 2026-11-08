"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerUpLeft, Loader2, Maximize2, Send, X } from "lucide-react";
import type { ThreadDetailDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { htmlToText, isBlankHtml, textToHtml } from "@/lib/mail-frame";
import { snapshotSendContent, useSendIdentity } from "@/lib/send-identity";
import { modKeyLabel } from "@/lib/keys";
import s from "@/components/mail/compose.module.css";
import { TONES } from "@/components/ai-panel";
import { RichTextEditor } from "@/components/editor";
import { ErrorText } from "@/components/ui";
import { replyContextFromThread, type ComposeContext } from "@/components/compose";

/**
 * The place a conversation ends: somewhere to answer it.
 *
 * Replying used to mean opening a modal over the thread you were replying to,
 * which is the wrong shape for the common case: a two-line answer to the
 * message on screen. This is deliberately *not* a second composer: it types and
 * it sends, and the moment you need anything else (attachments, a template, the
 * AI tools, a preview) the "Open in composer" control hands the text you have
 * already written to the full sheet. One writing surface's worth of features,
 * in the place you are already looking.
 *
 * The recipient, subject and quoted history come from the same
 * `replyContextFromThread` the modal uses, so a reply sent from here and one
 * sent from there are byte-for-byte the same message.
 */
export function ReplyDock({
  thread,
  connectionId,
  open,
  onOpenChange,
  onExpand,
  draftHtml,
  onDraftChange,
}: {
  thread: ThreadDetailDto;
  connectionId: string;
  /** Owned by the mail view so the "r" shortcut can open this dock, not a modal. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hands the in-progress text to the full compose sheet. */
  onExpand: (ctx: ComposeContext) => void;
  draftHtml?: string;
  onDraftChange?: (html: string) => void;
}) {
  const queryClient = useQueryClient();
  const [localBody, setLocalBody] = useState("");
  const body = draftHtml ?? localBody;
  const setBody = (html: string) => {
    setLocalBody(html);
    onDraftChange?.(html);
  };
  const [tone, setTone] = useState<'professional' | 'friendly' | 'concise'>('professional');
  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, enabled: open });
  const bodyRef = useRef(body);
  useEffect(() => { bodyRef.current = body; }, [body]);
  const assist = useMutation({
    mutationFn: async (snapshot: string) => {
      if (isBlankHtml(snapshot)) return (await api.suggestReply({ threadId: thread.id, tone })).reply;
      return (await api.rewrite({ body: htmlToText(snapshot), tone })).body;
    },
    onSuccess: (result, snapshot) => {
      if (bodyRef.current === snapshot) setBody(textToHtml(result));
      else setError('Your reply changed while assist was working. Try again.');
    },
    onError: (error) => setError(error instanceof Error ? error.message : 'Writing assist could not load.'),
  });
  const [error, setError] = useState<string | null>(null);
  const [modKey] = useState(modKeyLabel);
  const surface = useRef<HTMLDivElement>(null);

  const ctx = replyContextFromThread(connectionId, thread);
  const correspondent = ctx.correspondent?.name || ctx.correspondent?.address || "this thread";

  // The mail view keeps drafts by thread while it is mounted. Reset standalone
  // dock state on a thread change so text never follows a different recipient.
  const [lastThreadId, setLastThreadId] = useState(thread.id);
  const sendId = useSendIdentity(null);
  const [confirmNewSend, setConfirmNewSend] = useState(false);
  if (thread.id !== lastThreadId) {
    setLastThreadId(thread.id);
    setLocalBody("");
    setError(null);
    setConfirmNewSend(false);
    sendId.resetWithNewKey();
  }

  const setOpen = onOpenChange;

  useEffect(() => {
    if (!open) return;
    surface.current?.querySelector<HTMLElement>("[contenteditable]")?.focus();
  }, [open]);

  const contentSnapshot = () => {
    const outgoing = ctx.quotedHtml ? `${body}\n<br>\n${ctx.quotedHtml}` : body;
    return snapshotSendContent({
      to: ctx.prefillTo ?? "",
      cc: "",
      bcc: "",
      subject: ctx.prefillSubject ?? "",
      body: outgoing,
      attachmentIds: [],
      skipBrandWrap: false,
    });
  };

  const send = useMutation({
    mutationFn: (key: string) => {
      const outgoing = ctx.quotedHtml ? `${body}\n<br>\n${ctx.quotedHtml}` : body;
      return api.sendMail({
        mailboxConnectionId: connectionId,
        draftId: null,
        replyToThreadId: thread.id,
        toAddrs: ctx.prefillTo ?? "",
        ccAddrs: null,
        bccAddrs: null,
        subject: ctx.prefillSubject || "(no subject)",
        bodyHtml: outgoing,
        bodyText: htmlToText(outgoing),
        attachmentIds: [],
        idempotencyKey: key,
      });
    },
    onSuccess: () => {
      setBody("");
      sendId.noteSuccess();
      setConfirmNewSend(false);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["thread", thread.id] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
    },
    onError: (e) => {
      const resolution = sendId.noteError(e, contentSnapshot());
      if (resolution.action === "send" && resolution.key !== sendId.key) {
        setError("The request changed, so retrying with a fresh request.");
        send.mutate(resolution.key);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not send the reply.");
    },
  });

  const onSend = () => {
    setError(null);
    setConfirmNewSend(false);
    if (assist.isPending) {
      setError("Wait for writing assist to finish before sending.");
      return;
    }
    if (isBlankHtml(body)) {
      setError("The reply is empty.");
      return;
    }
    if (!ctx.prefillTo) {
      setError("This thread has no reply address.");
      return;
    }
    if (!sendId.canSend) {
      setError(
        sendId.outcome === "accepted"
          ? "This reply was already sent."
          : "This reply may already have gone out. Check Sent before starting a new send."
      );
      return;
    }
    send.mutate(sendId.keyForSend(contentSnapshot()));
  };

  if (!open) {
    return (
      <div className="reply-dock">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="reply-dock-collapsed"
          title="Reply (r)"
        >
          <CornerUpLeft aria-hidden size={15} className="shrink-0 opacity-60" />
          <span className="truncate">Reply to {correspondent}…</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-line px-1 font-mono text-[10px] sm:inline">
            r
          </kbd>
        </button>
      </div>
    );
  }

  return (
    <div className="reply-dock">
      <div
        ref={surface}
        className={s.reply}
        onKeyDown={(e) => {
          // The mail view listens on window for j/k/r/e/u. This is where letters
          // are meant to be typed.
          e.stopPropagation();
          if (e.key === "Escape" && isBlankHtml(body)) {
            e.preventDefault();
            setOpen(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend();
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <CornerUpLeft aria-hidden size={13} className="shrink-0 text-fg" />
          <span className="min-w-0 truncate text-[11px] text-muted">
            To <span className="font-medium">{correspondent}</span>
          </span>
          <button
            type="button"
            onClick={() => onExpand({ ...ctx, prefillBody: body })}
            className="editor-tool ml-auto h-6 w-6"
            title="Open in the full composer: attachments, templates and preview"
            aria-label="Open in full composer"
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setBody("");
              setError(null);
            }}
            className="editor-tool h-6 w-6"
            title="Discard this reply"
            aria-label="Discard reply"
          >
            <X size={13} />
          </button>
        </div>

        <RichTextEditor
          html={body}
          onHtmlChange={setBody}
          ariaLabel="Reply body"
          placeholder="Write your reply…"
          className="[--editor-pad-x:0.75rem] [&_.editor-surface]:max-h-56 [&_.editor-surface]:min-h-[5rem] [&_.editor-surface]:overflow-y-auto [&_.editor-toolbar]:px-3"
        />

        {aiStatus.data?.configured && <div className={s.tones} role="group" aria-label="Reply tone">
          {TONES.map((item) => <button key={item.key} type="button" disabled={assist.isPending || send.isPending} aria-pressed={tone === item.key} onClick={() => setTone(item.key)}>{item.label}</button>)}
          <button type="button" disabled={assist.isPending || send.isPending} onClick={() => assist.mutate(body)}>{assist.isPending ? 'Working...' : isBlankHtml(body) ? 'Suggest reply' : 'Rewrite'}</button>
        </div>}
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={onSend}
            disabled={send.isPending || assist.isPending || !sendId.canSend}
            className={cn("reader-action reader-action-primary", send.isPending && "opacity-70")}
          >
            {send.isPending ? (
              <Loader2 aria-hidden size={14} className="animate-spin" />
            ) : (
              <Send aria-hidden size={14} />
            )}
            {send.isPending ? "Sending…" : "Send"}
            <kbd className="ml-1 hidden rounded border border-line px-1 text-[10px] font-medium opacity-70 sm:inline">
              {modKey}↵
            </kbd>
          </button>
          <span className="ml-auto truncate text-[10px] text-muted">
            Quoted history is attached on send
          </span>
        </div>
      </div>

      {error && (
        <div className="pt-1.5">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {sendId.outcome === "uncertain" && (
        <div className="flex flex-wrap items-center gap-2 px-1 pt-1.5 text-[11px] text-muted">
          <span>
            {confirmNewSend
              ? "Confirm this is a new send after checking Sent."
              : "Check the Sent folder first, then start a new send if it is missing."}
          </span>
          <button
            type="button"
            onClick={() => {
              if (confirmNewSend) {
                sendId.resetWithNewKey();
                setConfirmNewSend(false);
                setError(null);
              } else {
                setConfirmNewSend(true);
              }
            }}
            className="reader-action !px-2 !py-1 !text-[11px]"
          >
            {confirmNewSend ? "Confirm new send" : "Start a new send"}
          </button>
        </div>
      )}
    </div>
  );
}
