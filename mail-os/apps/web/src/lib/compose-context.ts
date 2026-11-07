import type { AttachmentDto, MailDraftDto, ThreadDetailDto } from "@kompanion/types";
import { bodyFragment, escapeHtml, textToHtml } from "./mail-frame";
import { snapshotSendContent } from "./send-identity";

export interface ComposeContext {
  mode: "new" | "reply";
  connectionId: string;
  /** When continuing an existing draft, so saving updates it instead of forking a copy. */
  draftId?: string;
  /** Row version last confirmed for the draft, for stale-save rejection. */
  rowVersion?: number | null;
  /** When replying, the thread being replied to (lets the server resolve In-Reply-To). */
  replyToThreadId?: string;
  /** Latest message id in the reply thread, when known (lets drafts keep reply headers). */
  replyToMessageId?: number | null;
  /** Stored References chain for a resumed draft. */
  replyReferences?: string[] | null;
  /** Who is being replied to, as an address for the reply headers. */
  replyToAddress?: string | null;
  /** Pre-fill To when replying. */
  prefillTo?: string;
  prefillCc?: string;
  prefillBcc?: string;
  /** Pre-fill subject when replying. */
  prefillSubject?: string;
  /** Pre-fill body, HTML, and only what the user should be typing into. */
  prefillBody?: string;
  /** Files already bound to the resumed draft. */
  prefillAttachments?: AttachmentDto[];
  /** Carried from a resumed draft or template: skip the brand kit on send. */
  skipBrandWrap?: boolean;
  /** Recorded send key for a resumed draft, if any attempt was made. */
  lastSendKey?: string | null;
  /** Recorded outcome for a resumed draft: Sending, Accepted, Uncertain or Failed. */
  lastSendStatus?: string | null;
  /** Content snapshot of the recorded failed attempt, for edit detection. */
  lastSendContent?: string | null;
  /**
   * The conversation so far, as HTML. Kept out of the editing surface and appended
   * on send, the way every graphical mail client handles quoted history.
   */
  quotedHtml?: string;
  /** Who is being replied to, for the sheet header. */
  correspondent?: { name?: string | null; address?: string | null };
  /** Secondary line in the header, e.g. "Re: Invoice #1042 | 3 messages". */
  contextLine?: string;
}

/**
 * Builds the reply context for a thread.
 *
 * The old version prefixed every line of the stored body with "> ", on HTML mail
 * that meant the compose window opened with a doctype, a `<style>` block and the
 * brand footer escaped into the field the user was meant to type in. Here the
 * history becomes a nested blockquote kept beside the editor, and the editor itself
 * opens empty.
 */
export function replyContextFromThread(
  connectionId: string,
  thread: ThreadDetailDto
): ComposeContext {
  const latest = thread.messages[thread.messages.length - 1];
  const address = latest?.fromAddr ?? "";
  const name = latest?.fromName ?? null;
  const to = name && address ? `${name} <${address}>` : address;

  const subject = thread.subject?.toLowerCase().startsWith("re:")
    ? thread.subject
    : `Re: ${thread.subject ?? ""}`;

  // Newest first, each nested inside the one before it, the shape a mail client
  // produces, and the shape the recipient's client knows how to collapse.
  const quotedHtml = [...thread.messages]
    .reverse()
    .reduce((inner, m) => {
      const when = m.date ? new Date(m.date).toLocaleString() : "";
      const who = m.fromName || m.fromAddr || "Unknown";
      const content = m.bodyHtml
        ? bodyFragment(m.bodyHtml)
        : textToHtml(m.bodyText ?? "");
      return (
        `<blockquote style="margin:0 0 0 8px;padding-left:12px;border-left:2px solid #ddd">` +
        `<p style="color:#666;font-size:12px;margin:0 0 8px">` +
        `On ${escapeHtml(when)}, ${escapeHtml(who)} wrote:</p>` +
        content +
        inner +
        `</blockquote>`
      );
    }, "");

  const count = thread.messageCount || thread.messages.length;
  return {
    mode: "reply",
    connectionId,
    replyToThreadId: thread.id,
    replyToMessageId: latest?.id ?? null,
    replyToAddress: address || null,
    prefillTo: to,
    prefillSubject: subject,
    prefillBody: "",
    quotedHtml,
    correspondent: { name, address },
    contextLine: `${thread.subject ?? "(no subject)"} | ${count} message${count === 1 ? "" : "s"}`,
  };
}

export function loadDraftToContext(  connectionId: string,
  draft: MailDraftDto
): ComposeContext {
  const body = draft.bodyHtml ?? (draft.bodyText ? textToHtml(draft.bodyText) : "");
  let replyReferences: string[] | null = null;
  if (draft.references) {
    try {
      const parsed: unknown = JSON.parse(draft.references);
      if (Array.isArray(parsed)) replyReferences = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      replyReferences = null;
    }
  }
  return {
    mode: draft.replyToMessageId || draft.replyToThreadId ? "reply" : "new",
    connectionId,
    draftId: draft.id,
    rowVersion: draft.rowVersion ?? null,
    replyToThreadId: draft.replyToThreadId ?? undefined,
    replyToMessageId: draft.replyToMessageId ?? null,
    replyReferences,
    replyToAddress: draft.replyToAddress ?? null,
    prefillTo: draft.toAddrs ?? "",
    prefillCc: draft.ccAddrs ?? undefined,
    prefillBcc: draft.bccAddrs ?? undefined,
    prefillSubject: draft.subject ?? "",
    prefillBody: body,
    prefillAttachments: draft.attachments ?? [],
    skipBrandWrap: draft.skipBrandWrap,
    lastSendKey: draft.lastSend?.key ?? null,
    lastSendStatus: draft.lastSend?.status ?? null,
    lastSendContent: draft.lastSend
      ? snapshotSendContent({
          to: draft.lastSend.rawTo ?? "",
          cc: draft.lastSend.rawCc ?? "",
          bcc: draft.lastSend.rawBcc ?? "",
          subject: draft.lastSend.rawSubject ?? "",
          body: draft.lastSend.rawBody ?? "",
          attachmentIds: draft.lastSend.rawAttachmentIds ?? [],
          skipBrandWrap: draft.lastSend.skipBrandWrap,
        })
      : null,
    contextLine: draft.subject ?? undefined,
  };
}

/** Comparable snapshot of everything autosave persists for one compose session. */
export interface ComposeSnapshot {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  skipBrandWrap: boolean;
  attachmentIds: string;
}

export function snapshotFromContext(ctx: ComposeContext): ComposeSnapshot {
  return {
    to: ctx.prefillTo ?? "",
    cc: ctx.prefillCc ?? "",
    bcc: ctx.prefillBcc ?? "",
    subject: ctx.prefillSubject ?? "",
    body: ctx.prefillBody ?? "",
    skipBrandWrap: ctx.skipBrandWrap ?? false,
    attachmentIds: (ctx.prefillAttachments ?? []).map((a) => a.id).sort().join(","),
  };
}

/** True when any persisted field differs from the opening snapshot. */
export function isComposeDirty(opened: ComposeSnapshot, current: ComposeSnapshot): boolean {
  return (
    current.to !== opened.to ||
    current.cc !== opened.cc ||
    current.bcc !== opened.bcc ||
    current.subject !== opened.subject ||
    current.body !== opened.body ||
    current.skipBrandWrap !== opened.skipBrandWrap ||
    current.attachmentIds !== opened.attachmentIds
  );
}
