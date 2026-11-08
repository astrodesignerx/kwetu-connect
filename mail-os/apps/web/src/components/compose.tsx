"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
  Code2,
  Type,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { ApiError } from "@kompanion/api-client";
import { cn } from "@/lib/cn";
import { modKeyLabel } from "@/lib/keys";
import {
  frameDocument,
  htmlToText,
  isBlankHtml,
  textToHtml,
} from "@/lib/mail-frame";
import { RichTextEditor } from "@/components/editor";
import { EditorMergeFieldMenu } from "@/components/merge-field-menu";
import { fromChips, labelFor, toChips } from "@/lib/merge-fields";
import { GlassPanel } from "@/components/glass";
import s from "@/components/mail/compose.module.css";
import { RecipientField } from "@/components/mail/recipient-field";
import { Button, ErrorText, MutedText } from "@/components/ui";
import { TONES } from "@/components/ai-panel";
import { formatBytes } from "@/components/attachments";
import type {
  AttachmentDto,
  EmailTemplatePreviewDto,
  SendRequest,
} from "@kompanion/types";

import { newComposeKey } from "@/lib/compose-keys";
import {
  clearStoredIdentity,
  snapshotSendContent,
  useSendIdentity,
} from "@/lib/send-identity";
import {
  isComposeDirty,
  loadDraftToContext,
  replyContextFromThread,
  snapshotFromContext,
  type ComposeContext,
} from "@/lib/compose-context";

export { loadDraftToContext, replyContextFromThread, type ComposeContext };

/**
 * Width the template preview is rendered at before being scaled into the pane.
 * 640 is the max-width the brand kit centres the body in : the page width of
 * these emails. Going wider only adds margin, which costs scale for nothing.
 */
const PREVIEW_CANVAS_WIDTH = 640;

export function ComposeModal({
  ctx,
  onClose,
}: {
  ctx: ComposeContext;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState(ctx.prefillTo ?? "");
  const [cc, setCc] = useState(ctx.prefillCc ?? "");
  const [bcc, setBcc] = useState(ctx.prefillBcc ?? "");
  const [showCc, setShowCc] = useState(!!ctx.prefillCc);
  const [showBcc, setShowBcc] = useState(!!ctx.prefillBcc);
  const [subject, setSubject] = useState(ctx.prefillSubject ?? "");
  const [body, setBody] = useState(ctx.prefillBody ?? "");
  const [sourceMode, setSourceMode] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [draftId, setDraftId] = useState<string>(() => ctx.draftId ?? newComposeKey());
  // Once a send or discard starts, pending autosaves must not recreate the row.
  const settledRef = useRef(false);
  // One composition keeps one send identity across reloads and remounts, so an
  // uncertain or accepted outcome cannot be bypassed with a fresh key. Derived
  // from stable context values, never from a ref.
  const compositionId =
    ctx.draftId ?? (ctx.replyToThreadId ? `thread:${ctx.replyToThreadId}` : null);
  const sendId = useSendIdentity(
    compositionId,
    ctx.lastSendKey,
    ctx.lastSendStatus,
    ctx.lastSendContent
  );
  const [confirmNewSend, setConfirmNewSend] = useState(false);
  const autoRetriedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  // Carried from whichever template was applied or draft was resumed: a self-branded
  // body has to be sent without the brand kit, or it goes out doubled.
  const [skipBrandWrap, setSkipBrandWrap] = useState(ctx.skipBrandWrap ?? false);
  const [showPreview, setShowPreview] = useState(false);
  const [tone, setTone] = useState<"professional" | "friendly" | "concise">("professional");
  const [aiError, setAiError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDto[]>(ctx.prefillAttachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modKey] = useState(modKeyLabel);

  const fileInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const toInput = useRef<HTMLInputElement>(null);

  const isReply = ctx.mode === "reply";
  const quoted = ctx.quotedHtml ?? "";

  // Opening a reply pre-fills To and Subject, which is not the user having written
  // anything. Without this, glancing at a thread and pressing Escape left a draft
  // behind for every message you looked at. Every persisted field is compared, so
  // an attachment-only or brand-only edit still autosaves.
  const [opened] = useState(() => snapshotFromContext(ctx));
  const attachmentIds = useMemo(
    () => attachments.map((a) => a.id).sort().join(","),
    [attachments]
  );
  const dirty = isComposeDirty(opened, {
    to,
    cc,
    bcc,
    subject,
    body,
    skipBrandWrap,
    attachmentIds,
  });
  const hasContent = !!(to.trim() || subject.trim() || !isBlankHtml(body) || attachments.length > 0);

  /** What actually goes on the wire: what the user wrote, then the history. */
  const outgoingHtml = useMemo(
    () => (quoted ? `${body}\n<br>\n${quoted}` : body),
    [body, quoted]
  );

  /* -- Drafts ---------------------------------------------------------------
     Autosave on a 1.5s idle timer with a visible "Saved 14:32", rather than the
     previous silent write in an unmount cleanup. Same number of round trips in
     practice, but the user can see that closing the window is safe.
     ------------------------------------------------------------------------ */

  // A mirror of the current values that callbacks can read without being rebuilt on
  // every keystroke. Written after commit, never during render. Carries every
  // persisted field together so a save is one consistent snapshot.
  const latest = useRef({
    to,
    cc,
    bcc,
    subject,
    outgoingHtml,
    draftId,
    hasContent,
    dirty,
    skipBrandWrap,
    attachmentIds: attachments.map((a) => a.id),
  });
  useEffect(() => {
    latest.current = {
      to,
      cc,
      bcc,
      subject,
      outgoingHtml,
      draftId,
      hasContent,
      dirty,
      skipBrandWrap,
      attachmentIds: attachments.map((a) => a.id),
    };
  });
  // Row version last confirmed by the server; sent back so a stale save is
  // rejected instead of overwriting. Unknown until the first save or resume.
  const lastSavedVersionRef = useRef<number | null>(ctx.rowVersion ?? null);

  // Saves run one at a time in arrival order: overlapping autosaves serialize
  // instead of racing, and send/discard await the outstanding save first.
  const saveChainRef = useRef(Promise.resolve());

  const doSaveDraft = useCallback(async () => {
    const s = latest.current;
    if (settledRef.current || !s.hasContent || !s.dirty) return;
    setSaving(true);
    try {
      const saved = await api.upsertDraft({
        id: s.draftId,
        mailboxConnectionId: ctx.connectionId,
        replyToMessageId: ctx.replyToMessageId ?? null,
        replyToAddress: ctx.replyToAddress ?? ctx.correspondent?.address ?? null,
        references: ctx.replyReferences ? JSON.stringify(ctx.replyReferences) : null,
        replyToThreadId: ctx.replyToThreadId ?? null,
        skipBrandWrap: s.skipBrandWrap,
        toAddrs: s.to || null,
        ccAddrs: s.cc || null,
        bccAddrs: s.bcc || null,
        subject: s.subject || null,
        bodyText: htmlToText(s.outgoingHtml) || null,
        bodyHtml: s.outgoingHtml || null,
        hasAttachments: false,
        attachmentMetaJson: null,
        attachmentIds: s.attachmentIds,
        expectedVersion: lastSavedVersionRef.current,
      });
      setDraftId(saved.id);
      lastSavedVersionRef.current = saved.rowVersion;
      setSavedAt(new Date());
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
    } catch (e) {
      if (e instanceof ApiError && (e.code === "draft_gone" || e.code === "draft_conflict")) {
        // The row was sent, discarded, or changed elsewhere: stop autosaving it
        // and say so, instead of forking or resurrecting anything.
        settledRef.current = true;
        setError(
          e.code === "draft_conflict"
            ? "This draft changed elsewhere. Reload it before saving again."
            : "This draft was already sent or discarded."
        );
        return;
      }
      // Autosave failing is not worth a banner over the compose window; the explicit
      // "Save draft" button surfaces the error when the user asks for it.
    } finally {
      setSaving(false);
    }
  }, [ctx.connectionId, ctx.replyToMessageId, ctx.replyToAddress, ctx.replyReferences, ctx.replyToThreadId, ctx.correspondent, queryClient]);

  const saveDraft = useCallback(() => {
    const run = saveChainRef.current.then(() => doSaveDraft());
    saveChainRef.current = run.catch(() => {});
    return run;
  }, [doSaveDraft]);

  useEffect(() => {
    if (!hasContent || !dirty) return;
    const t = setTimeout(() => void saveDraft(), 1500);
    return () => clearTimeout(t);
  }, [to, cc, bcc, subject, outgoingHtml, body, skipBrandWrap, attachments, hasContent, dirty, saveDraft]);

  /* -- Attachments ---------------------------------------------------------- */

  const onPickFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setUploading((n) => n + list.length);
    // Upload in parallel; each settles independently so one rejected file (too large,
    // say) doesn't discard the others the user picked in the same batch.
    await Promise.all(
      list.map(async (file) => {
        try {
          const uploaded = await api.uploadAttachment(file);
          setAttachments((prev) => [...prev, uploaded]);
        } catch (e) {
          setError(e instanceof Error ? e.message : `Could not attach ${file.name}.`);
        } finally {
          setUploading((n) => n - 1);
        }
      })
    );
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  function onRemoveAttachment(id: string) {
    setAttachments((list) => list.filter((a) => a.id !== id));
    // Fire-and-forget: the nightly sweep collects it even if this call fails.
    void api.deleteStagedAttachment(id).catch(() => {});
  }

  /* -- Closing --------------------------------------------------------------
     Nothing snaps: the sheet plays its exit before the tree goes.
     ------------------------------------------------------------------------ */

  const dismiss = useCallback(
    ({ save }: { save: boolean }) => {
      if (save) void saveDraft();
      setClosing(true);
      setTimeout(onClose, 170);
    },
    [onClose, saveDraft]
  );

  const discard = useCallback(async () => {
    settledRef.current = true;
    clearStoredIdentity(
      ctx.draftId ?? (ctx.replyToThreadId ? `thread:${ctx.replyToThreadId}` : null)
    );
    // Let an in-flight save land first so the delete targets the final row;
    // bounded so a stuck save cannot hold the window open.
    try {
      await Promise.race([
        saveChainRef.current,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Saving is still in progress. Try again when it finishes.")), 5000)),
      ]);
    } catch (e) {
      settledRef.current = false;
      setError(e instanceof Error ? e.message : "Could not finish saving.");
      return;
    }
    const id = latest.current.draftId;
    if (id) {
      try {
        await api.deleteDraft(id);
      } catch (e) {
        settledRef.current = false;
        setError(e instanceof Error ? e.message : "Could not discard the draft.");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
    }
    setClosing(true);
    setTimeout(onClose, 170);
  }, [onClose, queryClient, ctx]);

  /* -- Send ----------------------------------------------------------------- */

  const contentSnapshot = useCallback(
    () =>
      snapshotSendContent({
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim() || (isReply ? "(no subject)" : ""),
        body: outgoingHtml,
        attachmentIds: attachments.map((a) => a.id),
        skipBrandWrap,
      }),
    [to, cc, bcc, subject, isReply, outgoingHtml, attachments, skipBrandWrap]
  );

  const send = useMutation<{ messageId: string }, Error, SendRequest>({
    mutationFn: api.sendMail,
    onSuccess: () => {
      settledRef.current = true;
      sendId.noteSuccess();
      clearStoredIdentity(compositionId);
      void queryClient.invalidateQueries({ queryKey: ["drafts"] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
      dismiss({ save: false });
    },
    onError: (e) => {
      // The composition is preserved for a retry; autosave resumes with it,
      // unless the outcome blocks new sends until explicitly resolved.
      settledRef.current = false;
      const resolution = sendId.noteError(e, contentSnapshot());
      if (resolution.action === "send" && resolution.key !== sendId.key && !autoRetriedRef.current) {
        // The failed identity is spent (content mismatch on a safely failed
        // operation): one immediate attempt with the fresh identity.
        autoRetriedRef.current = true;
        setError("The request changed, so retrying with a fresh request.");
        send.mutate(buildSendRequest(resolution.key));
        return;
      }
      setError(e.message);
    },
  });

  const buildSendRequest = useCallback(
    (key: string): SendRequest => {
      return {
        mailboxConnectionId: ctx.connectionId,
        // Hand over the autosaved row (if this window has one) so the send path can
        // consume it. Sending `null` here left every sent draft in /drafts forever.
        draftId: latest.current.draftId,
        replyToThreadId: ctx.replyToThreadId ?? null,
        toAddrs: to.trim(),
        ccAddrs: cc.trim() || null,
        bccAddrs: bcc.trim() || null,
        subject: subject.trim() || (isReply ? "(no subject)" : ""),
        // HTML, not text. Sending the body as bodyText meant the brand kit was never
        // applied and SMTP shipped a text/plain part containing raw markup, which is
        // exactly what came back quoted in the next reply.
        bodyHtml: outgoingHtml,
        bodyText: htmlToText(outgoingHtml),
        attachmentIds: attachments.map((a) => a.id),
        skipBrandWrap,
        idempotencyKey: key,
      };
    },
    [ctx, to, cc, bcc, subject, isReply, outgoingHtml, attachments, skipBrandWrap]
  );

  const onSend = useCallback(async () => {
    setError(null);
    setConfirmNewSend(false);
    if (!to.trim()) {
      setError("Add at least one recipient.");
      toInput.current?.focus();
      return;
    }
    if (isBlankHtml(body)) {
      setError("The message is empty.");
      return;
    }
    if (!sendId.canSend) {
      setError(
        sendId.outcome === "accepted"
          ? "This draft was already sent."
          : "This send may already have gone out. Check Sent before starting a new send."
      );
      return;
    }
    settledRef.current = true;
    // Wait for the outstanding autosave so the send consumes the final row;
    // bounded so a stuck save cannot hold the send open.
    try {
      await Promise.race([
        saveChainRef.current,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Saving is still in progress. Try again when it finishes.")), 5000)),
      ]);
    } catch (e) {
      settledRef.current = false;
      setError(e instanceof Error ? e.message : "Could not finish saving.");
      return;
    }
    send.mutate(buildSendRequest(sendId.keyForSend(contentSnapshot())));
  }, [to, body, send, sendId, contentSnapshot, buildSendRequest]);

  /* -- Preview --------------------------------------------------------------
     Previously unreachable: the toggle was `lg:hidden` while the panel it toggled
     was `hidden lg:flex`, so the button existed only on the widths where the panel
     could not appear. Now it is a header control at every width, and it refreshes
     itself as you type instead of behind a "Refresh preview" button.
     ------------------------------------------------------------------------ */

  const preview = useMutation({
    mutationFn: (html: string) =>
      api.previewTemplate({
        subject: subject || null,
        bodyHtml: html || null,
        variables: detectVariables(`${subject} ${html}`),
        skipBrandWrap,
      }),
  });

  const previewRef = useRef(preview);
  useEffect(() => {
    previewRef.current = preview;
  });

  useEffect(() => {
    if (!showPreview || isBlankHtml(outgoingHtml)) return;
    const t = setTimeout(() => previewRef.current.mutate(outgoingHtml), 600);
    return () => clearTimeout(t);
  }, [showPreview, outgoingHtml, subject, skipBrandWrap]);

  /* -- AI ------------------------------------------------------------------- */

  const aiStatus = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  const aiReady = !!aiStatus.data?.configured;

  const suggest = useMutation({
    mutationFn: () =>
      ctx.replyToThreadId
        ? api.suggestReply({ threadId: ctx.replyToThreadId, tone })
        : Promise.reject(new Error("Reply context required.")),
    onSuccess: (r) => {
      // The AI returns prose, not markup; wrapping it keeps the editor from showing
      // one run-on paragraph.
      setBody(looksLikeHtml(r.reply) ? r.reply : textToHtml(r.reply));
      setAiError(null);
    },
    onError: (e) => setAiError(e instanceof Error ? e.message : "Could not draft a reply."),
  });

  const rewrite = useMutation({
    mutationFn: () => api.rewrite({ body: htmlToText(body), tone }),
    onSuccess: (r) => {
      setBody(looksLikeHtml(r.body) ? r.body : textToHtml(r.body));
      setAiError(null);
    },
    onError: (e) => setAiError(e instanceof Error ? e.message : "Could not rewrite."),
  });

  const aiBusy = suggest.isPending || rewrite.isPending;

  /* -- Templates ------------------------------------------------------------
     Applying a template used to drop its raw HTML : placeholders and all :
     straight into the editor, leaving `{{client_name}}` for the user to find and
     overwrite. Anything they missed went out to the client verbatim, because the
     send path substitutes a missing variable with its own name. The picker now
     asks for the values first and inserts a finished message.
     ------------------------------------------------------------------------ */

  function applyTemplate(result: { subject: string; bodyHtml: string; skipBrandWrap: boolean }) {
    if (result.subject) setSubject(result.subject);
    setBody(result.bodyHtml);
    setSkipBrandWrap(result.skipBrandWrap);
    setShowTemplates(false);
  }

  /* -- Keyboard and focus ---------------------------------------------------
     A modal that does not trap focus is a modal in appearance only: Tab walks
     straight out into the thread list behind it.
     ------------------------------------------------------------------------ */

  useEffect(() => {
    (ctx.prefillTo ? sheet.current?.querySelector<HTMLElement>("[data-editor] [contenteditable]") : toInput.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSheetKeyDown(e: React.KeyboardEvent) {
    // The mail list listens on window for j/k/r/c. Those are letters, and this window
    // is where letters get typed.
    e.stopPropagation();

    if (e.key === "Escape" && !showTemplates) {
      e.preventDefault();
      dismiss({ save: true });
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSend();
      return;
    }
    if (e.key !== "Tab") return;

    const focusables = [
      ...(sheet.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      ) ?? []),
      // The file picker is `display:none` and cannot take focus; leaving it in the
      // list would make Tab land on nothing at the end of the cycle.
    ].filter((el) => el.offsetParent !== null || el.tagName === "BODY");
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={cn("compose-backdrop", s.backdrop)}
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={isReply ? "Reply" : "New message"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss({ save: true });
      }}
    >
      {/* The wrapper is purely a positioning box: it owns the sheet's size, the
          focus trap and the drag/drop target, so the close pill can float above
          the sheet's top edge without being clipped by the sheet's own
          `overflow-hidden` (needed for its rounded corners and internal scroll
          regions). */}
      <div
        ref={sheet}
        className={cn("relative w-full max-w-6xl", s.layout)}
        onKeyDown={onSheetKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onPickFiles(e.dataTransfer.files);
        }}
      >
        <button
          type="button"
          onClick={() => dismiss({ save: true })}
          className="compose-close-pill"
          title="Close (Esc). The draft is kept."
          aria-label="Close compose"
        >
          <X aria-hidden size={15} strokeWidth={2.4} />
        </button>

        <div className={cn("compose-sheet", s.sheet)}>
        <header className={s.heading}><b>{isReply ? "Reply" : "New message"}</b><span>{saving ? "Saving..." : savedAt ? `Draft saved ${timeOf(savedAt)}` : "Draft autosaves as you write"}</span></header>
        <div className={s.writingLayout}><div className={s.main}>
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1",
            showPreview && "lg:grid-cols-[minmax(0,1fr)_22rem]"
          )}
        >
          {/* ---- Left: the message ----
              Below lg there is no room for two columns, so the preview replaces the
              editor rather than the toggle doing nothing : which is what the old
              `lg:hidden` button over a `hidden lg:flex` panel amounted to. */}
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-y-auto",
              showPreview && "hidden lg:flex"
            )}
          >
            <div className="compose-row">
              <label htmlFor="compose-to" className="compose-row-label">
                To:
              </label>
              <RecipientField id="compose-to" value={to} onChange={setTo} inputRef={toInput} placeholder="Enter email" />
              <div className="flex shrink-0 items-center gap-3 pt-0.5">
                {!showCc && (
                  <button
                    type="button"
                    className="compose-row-link"
                    onClick={() => setShowCc(true)}
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    className="compose-row-link"
                    onClick={() => setShowBcc(true)}
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {showCc && (
              <div className="compose-row">
                <label htmlFor="compose-cc" className="compose-row-label">
                  Cc:
                </label>
              <RecipientField id="compose-cc" value={cc} onChange={setCc}  placeholder="Comma-separated" />
              </div>
            )}

            {showBcc && (
              <div className="compose-row">
                <label htmlFor="compose-bcc" className="compose-row-label">
                  Bcc:
                </label>
              <RecipientField id="compose-bcc" value={bcc} onChange={setBcc}  placeholder="Hidden from other recipients" />
              </div>
            )}

            <div className="compose-row">
              <label htmlFor="compose-subject" className="compose-row-label">
                Subject:
              </label>
              <input
                id="compose-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="compose-bare-input font-medium"
              />
            </div>

            {/* ---- Writing surface ---- */}
            <div
              className="compose-dropzone flex min-h-0 flex-1 flex-col"
              data-dragging={dragging || undefined}
              data-editor
            >
              {sourceMode ? (
                <div className="flex min-h-0 flex-1 flex-col px-5">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="editor-source"
                    placeholder="<p>Type your message…</p>"
                    aria-label="Message code"
                  />
                  <MutedText>
                    <span className="text-xs">
                      The message as code. Tags like{" "}
                      <code className="font-mono">{"{{client_name}}"}</code> are filled in, and
                      your usual look is added, when it sends.
                    </span>
                  </MutedText>
                </div>
              ) : (
                <RichTextEditor
                  html={body}
                  onHtmlChange={setBody}
                  ariaLabel="Message body"
                  placeholder={isReply ? "Write your reply…" : "Write your message…"}
                  // Same chip treatment as the template editor. Applying a template
                  // here drops its placeholders into this surface, and showing them
                  // as {{client_name}} in the one window where the message is
                  // actually written is where the braces were most visible.
                  encode={toChips}
                  decode={fromChips}
                  tools={<EditorMergeFieldMenu />}
                  className="[--editor-pad-x:1.25rem] [&_.editor-toolbar]:sticky [&_.editor-toolbar]:top-0 [&_.editor-toolbar]:z-10 [&_.editor-toolbar]:bg-surface dark:[&_.editor-toolbar]:bg-surface-dark"
                />
              )}

              {/* ---- Quoted history, collapsed ---- */}
              {quoted && (
                <div className="px-5 pb-3">
                  <button
                    type="button"
                    className="quote-toggle"
                    onClick={() => setShowQuote((v) => !v)}
                    aria-expanded={showQuote}
                  >
                    <ChevronDown
                      size={13}
                      className="transition-transform duration-200 ease-out"
                      style={{ transform: showQuote ? "rotate(180deg)" : undefined }}
                    />
                    {showQuote ? "Hide quoted text" : "Show quoted text"}
                  </button>
                  {showQuote && (
                    <iframe
                      title="Quoted conversation"
                      srcDoc={frameDocument(quoted, true)}
                      sandbox=""
                      className="mt-2 h-64 w-full rounded-xl border border-line bg-white"
                    />
                  )}
                </div>
              )}

              {/* ---- Attachments ---- */}
              {(attachments.length > 0 || uploading > 0) && (
                <div className="flex flex-wrap gap-2 px-5 pb-3">
                  {attachments.map((a) => (
                    <div key={a.id} className="attach-card">
                      <Paperclip
                        size={14}
                        className="shrink-0 text-muted"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="max-w-[16rem] truncate text-xs font-medium">{a.fileName}</div>
                        <div className="text-[10px] text-muted">
                          {formatBytes(a.sizeBytes)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(a.id)}
                        aria-label={`Remove ${a.fileName}`}
                        className="editor-tool h-6 w-6 hover:!bg-red-500/10 hover:!text-red-500"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {uploading > 0 && (
                    <span className="inline-flex items-center gap-1.5 self-center text-xs text-muted">
                      <Loader2 size={13} className="animate-spin" />
                      Uploading {uploading} file{uploading === 1 ? "" : "s"}…
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* ---- Right: live preview ---- */}
          {showPreview && (
            <aside className="flex min-h-0 flex-col overflow-hidden lg:border-l lg:border-line dark:lg:border-line">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted">
                  Preview
                </span>
                {preview.isPending && (
                  <Loader2 size={12} className="animate-spin text-fg" aria-label="Rendering" />
                )}
                <span className="ml-auto truncate text-[11px] text-muted">
                  {preview.data?.subject || subject}
                </span>
              </div>
              <iframe
                title="Live preview"
                srcDoc={frameDocument(
                  preview.data?.bodyHtml ??
                    (isBlankHtml(outgoingHtml)
                      ? "<p style='color:#999'>Start typing to see the rendered email here.</p>"
                      : outgoingHtml),
                  true
                )}
                sandbox=""
                className="min-h-0 flex-1 border-0 bg-white"
              />
            </aside>
          )}
        </div>

        {(error || aiError) && (
          <div className="shrink-0 px-5 pb-1 pt-2">
            <ErrorText>{error ?? aiError}</ErrorText>
          </div>
        )}

        {/* An uncertain send blocks new attempts until explicitly resolved: a fresh
            key here could duplicate a delivery nobody can see yet. */}
        {sendId.outcome === "uncertain" && (
          <div className="shrink-0 px-5 pb-1 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
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
              {confirmNewSend && (
                <button
                  type="button"
                  onClick={() => setConfirmNewSend(false)}
                  className="compose-row-link"
                >
                  Keep waiting
                </button>
              )}
            </div>
          </div>
        )}

        {/* The send controls stay below the writing surface and assist rail. */}
        </div><aside className={s.assist} aria-label="Writing assist">
          {aiReady ? <WritingAssist isReply={isReply} tone={tone} setTone={setTone} aiBusy={aiBusy} bodyBlank={isBlankHtml(body)} onDraftReply={() => suggest.mutate()} onRewrite={() => rewrite.mutate()} /> : <section><h2>Writing assist</h2><p>AI is unavailable. You can keep writing and use templates.</p></section>}
          <section><h2>Templates</h2><button type="button" className={s.assistAction} onClick={() => setShowTemplates(true)}>Use a template</button></section>
        </aside></div>
        <div className="compose-actionbar">
              <Button onClick={onSend} disabled={send.isPending || !sendId.canSend} className="gap-2">
                {send.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                {send.isPending ? "Sending…" : "Send"}
                <kbd className="ml-1 hidden rounded border border-line px-1 text-[10px] font-medium opacity-70 sm:inline">
                  {modKey}↵
                </kbd>
              </Button>

              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void onPickFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={send.isPending}
                className="reader-action !px-2.5 !py-2"
              >
                <Paperclip aria-hidden size={15} />
                Add
              </button>

              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                className={cn("editor-tool h-8 w-8", showPreview && "editor-tool-active")}
                aria-pressed={showPreview}
                title={showPreview ? "Hide preview" : "Preview as the recipient sees it"}
                aria-label={showPreview ? "Hide preview" : "Show preview"}
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setSourceMode((s) => !s)}
                className={cn("editor-tool h-8 w-8", sourceMode && "editor-tool-active")}
                aria-pressed={sourceMode}
                title={sourceMode ? "Back to normal writing" : "Edit the code"}
                aria-label={sourceMode ? "Back to normal writing" : "Edit the code"}
              >
                {sourceMode ? <Type size={15} /> : <Code2 size={15} />}
              </button>

              <span className="flex-1" />

              <button
                type="button"
                onClick={discard}
                disabled={send.isPending}
                className="editor-tool h-8 w-8 hover:!bg-red-500/10 hover:!text-red-500"
                title="Discard this draft"
                aria-label="Discard draft"
              >
                <Trash2 size={16} />
              </button>

        </div>
        </div>
      </div>

      {showTemplates && (
        <TemplatePicker onClose={() => setShowTemplates(false)} onApply={applyTemplate} />
      )}
    </div>
  );
}

/** Existing AI actions, presented beside the writing sheet. */
function WritingAssist({
  isReply,
  tone,
  setTone,
  aiBusy,
  bodyBlank,
  onDraftReply,
  onRewrite,
}: {
  isReply: boolean;
  tone: "professional" | "friendly" | "concise";
  setTone: (t: "professional" | "friendly" | "concise") => void;
  aiBusy: boolean;
  bodyBlank: boolean;
  onDraftReply: () => void;
  onRewrite: () => void;
}) {
  return <section><h2>Tone</h2><div className={s.tones} role="group" aria-label="Writing tone">{TONES.map((item) => <button type="button" key={item.key} aria-pressed={tone === item.key} onClick={() => setTone(item.key)}>{item.label}</button>)}</div>
    {isReply && <button type="button" className={s.assistAction} disabled={aiBusy} onClick={onDraftReply}>Draft a reply</button>}
    <button type="button" className={s.assistAction} disabled={aiBusy || bodyBlank} onClick={onRewrite}>{aiBusy ? 'Working...' : 'Rewrite'}</button>
  </section>;
}

/**
 * Pick a template by looking at it.
 *
 * This was a list of names over one line of description : which is the one thing
 * a template cannot be recognised by. These are designed emails; you know the
 * invoice from the campaign report by its shape, not by reading "Invoice due".
 * So the list stays on the left as the thing you choose from, and the right is
 * the actual rendered email at full width, scaled to fit.
 */
function TemplatePicker({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (r: { subject: string; bodyHtml: string; skipBrandWrap: boolean }) => void;
}) {
  // The preview endpoint, not the plain list: it carries bodyHtml with example
  // values already filled in, which is what the gallery page renders too.
  const { data, isLoading } = useQuery({
    queryKey: ["template-previews"],
    queryFn: api.listTemplatePreviews,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filling, setFilling] = useState<EmailTemplatePreviewDto | null>(null);
  const selected = data?.find((t) => t.id === selectedId) ?? data?.[0] ?? null;

  if (filling) {
    return (
      <TemplateFill
        template={filling}
        onBack={() => setFilling(null)}
        onClose={onClose}
        onApply={onApply}
      />
    );
  }

  return (
    <div
      className="v2-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pick a template"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <GlassPanel className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-base font-semibold">Pick a template</h3>
          <button
            className="editor-tool h-8 w-8"
            onClick={onClose}
            aria-label="Close picker"
            autoFocus
          >
            <X size={16} />
          </button>
        </header>

        {isLoading ? (
          <div className="p-6">
            <MutedText>Loading…</MutedText>
          </div>
        ) : !data?.length ? (
          <div className="p-6">
            <MutedText>No templates yet. Create one in Settings → Templates.</MutedText>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[16rem_minmax(0,1fr)]">
            {/* Left: what you are choosing from. */}
            <ul className="min-h-0 overflow-y-auto border-line p-2 sm:border-r">
              {data.map((t) => {
                const active = t.id === selected?.id;
                return (
                  <li key={t.id}>
                    <button
                      onMouseEnter={() => setSelectedId(t.id)}
                      onFocus={() => setSelectedId(t.id)}
                      onClick={() => setSelectedId(t.id)}
                      onDoubleClick={() => setFilling(t)}
                      aria-current={active}
                      className={cn(
                        "mb-1 w-full rounded-[var(--radius)] border px-3 py-2 text-left transition-[transform,opacity] duration-150 ease-out",
                        active
                          ? "border-fg bg-raise"
                          : "border-transparent hover:bg-raise "
                      )}
                    >
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="truncate text-xs text-muted">
                        {t.subject || t.description || "(no subject)"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Right: the email itself. */}
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                {selected && <TemplatePreviewPane html={selected.bodyHtml} />}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {selected?.variables.slice(0, 4).map((v) => (
                    <span key={v} className="chip">
                      {labelFor(v)}
                    </span>
                  ))}
                  {selected && selected.variables.length > 4 && (
                    <span className="chip">+{selected.variables.length - 4}</span>
                  )}
                </div>
                <Button
                  onClick={() => selected && setFilling(selected)}
                  disabled={!selected}
                  className="shrink-0"
                >
                  Use this template
                </Button>
              </div>
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

/**
 * Fill in the blanks, then insert a finished message.
 *
 * This is the half of the template system that was missing. A template knew what
 * it needed : `{{client_name}}`, `{{meeting_date}}` : but nothing ever asked for
 * those values, so the composer received raw markup and the user had to hunt
 * through a designed email overwriting placeholder chips by hand. Anything missed
 * was sent literally.
 *
 * Repeatable blocks are the reason this matters beyond convenience: an agenda is
 * "however many items you have", and there is no way to express that by editing
 * HTML in a rich-text editor. Here it is a list you add rows to.
 */
function TemplateFill({
  template,
  onBack,
  onClose,
  onApply,
}: {
  template: EmailTemplatePreviewDto;
  onBack: () => void;
  onClose: () => void;
  onApply: (r: { subject: string; bodyHtml: string; skipBrandWrap: boolean }) => void;
}) {
  // The gallery DTO carries the *rendered* body; substituting needs the original
  // with its placeholders intact.
  const { data: full, isLoading } = useQuery({
    queryKey: ["template", template.id],
    queryFn: () => api.getTemplate(template.id),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [lists, setLists] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(template.lists.map((name) => [name, [""]]))
  );

  const setValue = (name: string, v: string) => setValues((p) => ({ ...p, [name]: v }));
  const setItem = (name: string, i: number, v: string) =>
    setLists((p) => ({ ...p, [name]: (p[name] ?? []).map((x, j) => (j === i ? v : x)) }));
  const addItem = (name: string) =>
    setLists((p) => ({ ...p, [name]: [...(p[name] ?? []), ""] }));
  const removeItem = (name: string, i: number) =>
    setLists((p) => ({ ...p, [name]: (p[name] ?? []).filter((_, j) => j !== i) }));

  /* -- Live preview --------------------------------------------------------
     Unfilled fields fall back to the server's example values, so the preview is
     a finished email from the first frame rather than one full of holes. That
     fallback is deliberately *not* used on insert : see `insert` below.
     ----------------------------------------------------------------------- */

  const preview = useMutation({
    mutationFn: () =>
      api.previewTemplate({
        subject: full?.subject ?? null,
        bodyHtml: full?.bodyHtml ?? null,
        variables: template.variables,
        skipBrandWrap: full?.skipBrandWrap ?? false,
        values,
        lists,
        wrap: true,
      }),
  });

  const previewRef = useRef(preview);
  useEffect(() => {
    previewRef.current = preview;
  });

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => previewRef.current.mutate(), 400);
    return () => clearTimeout(t);
  }, [full, values, lists]);

  /* -- Insert -------------------------------------------------------------- */

  // Every blank has to be answered before this can produce a real message: an
  // unfilled field would otherwise reach the recipient either as the example
  // value ("Jane Wanjiru") or as the placeholder itself.
  const missing = [
    ...template.variables.filter((v) => !values[v]?.trim()),
    ...template.lists.filter((l) => !(lists[l] ?? []).some((i) => i.trim())),
  ];

  const insert = useMutation({
    mutationFn: () =>
      api.previewTemplate({
        subject: full?.subject ?? null,
        bodyHtml: full?.bodyHtml ?? null,
        variables: template.variables,
        skipBrandWrap: full?.skipBrandWrap ?? false,
        values,
        lists,
        // The body only : the brand kit is applied when the message is sent, and
        // wrapping here would put a second letterhead inside the editor.
        wrap: false,
      }),
    onSuccess: (r) =>
      onApply({
        subject: r.subject,
        bodyHtml: r.bodyHtml,
        skipBrandWrap: full?.skipBrandWrap ?? false,
      }),
  });

  return (
    <div
      className="v2-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Fill in ${template.name}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <GlassPanel className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3">
          <button onClick={onBack} className="reader-action !px-2" aria-label="Back to templates">
            <ChevronLeft aria-hidden size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold">{template.name}</h3>
            <p className="truncate text-xs text-muted">
              Fill in the details. The design stays as it is.
            </p>
          </div>
          <button className="editor-tool h-8 w-8" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="min-h-0 space-y-3 overflow-y-auto border-line p-4 sm:border-r">
            {isLoading ? (
              <MutedText>Loading…</MutedText>
            ) : (
              <>
                {template.variables.map((name) => (
                  <label key={name} className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      {labelFor(name)}
                    </span>
                    <input
                      value={values[name] ?? ""}
                      onChange={(e) => setValue(name, e.target.value)}
                      className="glass-input !py-1.5 !text-sm"
                      autoComplete="off"
                    />
                  </label>
                ))}

                {template.lists.map((name) => (
                  <div key={name}>
                    <span className="mb-1 block text-xs font-medium text-muted">
                      {labelFor(name)}
                    </span>
                    <div className="space-y-1.5">
                      {(lists[name] ?? []).map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            value={item}
                            onChange={(e) => setItem(name, i, e.target.value)}
                            className="glass-input !py-1.5 !text-sm"
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(name, i)}
                            disabled={(lists[name] ?? []).length <= 1}
                            className="editor-tool h-7 w-7 shrink-0 disabled:opacity-30"
                            aria-label="Remove item"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(name)}
                      className="reader-action mt-1.5 !px-2 !py-1 !text-[11px]"
                    >
                      <Plus aria-hidden size={12} />
                      Add another
                    </button>
                  </div>
                ))}

                {template.variables.length === 0 && template.lists.length === 0 && (
                  <MutedText>This template has nothing to fill in.</MutedText>
                )}
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden bg-white">
              {preview.data ? (
                <TemplatePreviewPane html={preview.data.bodyHtml} />
              ) : (
                <TemplatePreviewPane html={template.bodyHtml} />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {missing.length > 0
                  ? `${missing.length} still to fill in. The preview shows examples meanwhile.`
                  : "Ready to insert."}
              </span>
              <Button
                onClick={() => insert.mutate()}
                disabled={missing.length > 0 || insert.isPending || !full}
                className="shrink-0"
              >
                {insert.isPending ? "Inserting…" : "Insert"}
              </Button>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

/**
 * The template rendered at a desktop canvas width and scaled to fit the pane,
 * so the preview shows the layout a recipient on a laptop would see rather than
 * the phone layout at full size. The scale is measured because CSS cannot divide
 * one length by another.
 */
function TemplatePreviewPane({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((p) => (p.width === width && p.height === height ? p : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Never scale up past 1: a narrow email blown up to fill the pane would show a
  // layout no recipient ever gets.
  const scale = size.width > 0 ? Math.min(size.width / PREVIEW_CANVAS_WIDTH, 1) : 0;

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      {scale > 0 && (
        <iframe
          // Authored HTML that only needs to be looked at; an empty sandbox
          // keeps it inert.
          sandbox=""
          srcDoc={html}
          aria-hidden
          tabIndex={-1}
          scrolling="no"
          className="absolute left-0 top-0 border-0"
          style={{
            width: PREVIEW_CANVAS_WIDTH,
            height: size.height / scale,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      )}
    </div>
  );
}

/* -- Helpers ---------------------------------------------------------------- */

function detectVariables(text: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1]);
  return [...out];
}

function looksLikeHtml(value: string): boolean {
  return /<(p|div|br|ul|ol|table|h[1-6]|blockquote|span|strong|em|a)\b/i.test(value);
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
