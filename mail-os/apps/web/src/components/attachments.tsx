"use client";

import { useState } from "react";
import { Archive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Loader2, Paperclip, Presentation } from "lucide-react";
import type { AttachmentDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AttachmentPreview } from "@/components/mail/attachment-preview";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(contentType: string | null, fileName: string): React.ReactNode {
  const type = contentType?.toLowerCase() ?? "";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return <FileImage size={16} />;
  if (type === "application/pdf" || ext === "pdf") return <FileText size={16} />;
  if (type.startsWith("audio/")) return <FileAudio size={16} />;
  if (type.startsWith("video/")) return <FileVideo size={16} />;
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return <Archive size={16} />;
  if (["doc", "docx", "odt"].includes(ext)) return <FileText size={16} />;
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return <FileSpreadsheet size={16} />;
  if (["ppt", "pptx", "odp"].includes(ext)) return <Presentation size={16} />;
  return <Paperclip size={16} />;
}

/**
 * Downloads through the API client so the bearer token travels on the request, then
 * hands the blob to a synthetic anchor. A plain href would hit the endpoint
 * unauthenticated and 401.
 */
async function saveToDisk(attachment: AttachmentDto) {
  const blob = await api.downloadAttachment(attachment.id);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoking immediately can cancel the download in some browsers; one tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function AttachmentChip({ attachment }: { attachment: AttachmentDto }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          await saveToDisk(attachment);
          setState("idle");
        } catch {
          setState("error");
        }
      }}
      title={
        state === "error"
          ? "Download failed. Try again"
          : `${attachment.fileName} (${formatBytes(attachment.sizeBytes)})`
      }
      className={cn(
        "group flex max-w-[16rem] items-center gap-2 rounded-xl border px-3 py-2 text-left",
        "transition-[transform,background-color,border-color] duration-150 ease-out",
        "hover:-translate-y-px hover:bg-raise active:translate-y-0",
        "disabled:cursor-wait disabled:opacity-60",
        state === "error"
          ? "border-red-500/40 bg-red-500/5"
          : "border-line "
      )}
    >
      <span aria-hidden className="text-base leading-none">
        {state === "busy" ? <Loader2 size={16} className="signal-loading" /> : iconFor(attachment.contentType, attachment.fileName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{attachment.fileName}</span>
        <span className="block text-[10px] text-muted">
          {state === "error" ? "Failed. Retry" : formatBytes(attachment.sizeBytes)}
        </span>
      </span>
    </button>
  );
}

/** Filenames parsed from the legacy AttachmentMetaJson column. */
function legacyNames(metaJson: string | null): string[] {
  if (!metaJson) return [];
  try {
    const parsed: unknown = JSON.parse(metaJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((m) => (m && typeof m === "object" ? (m as { name?: string }).name : undefined))
      .filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

/**
 * Downloadable files on a message. Inline cid: parts are excluded : they render in
 * the body.
 *
 * Messages synced before the blob store existed carry HasAttachments and the filenames
 * but no stored bytes. Rendering nothing there made the list's paperclip a lie, so the
 * known names are shown with an explanation instead of silently disappearing.
 */
export function AttachmentList({
  attachments,
  hasAttachments = false,
  metaJson = null,
}: {
  attachments: AttachmentDto[];
  hasAttachments?: boolean;
  metaJson?: string | null;
}) {
  const files = attachments.filter((a) => !a.isInline);

  if (files.length === 0) {
    const names = hasAttachments ? legacyNames(metaJson) : [];
    if (!hasAttachments) return null;

    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-fg bg-raise px-2.5 py-2">
          <span aria-hidden><Paperclip size={14} /></span>
          <span className="text-xs text-muted">
            {names.length > 0
              ? `${names.join(", ")}: not downloaded yet.`
              : "This message has an attachment that hasn't been downloaded yet."}
          </span>
          <span className="text-[11px] text-muted">
            An admin can fetch it with{" "}
            <code className="font-mono">backfill-attachments</code>.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">
        {files.length} attachment{files.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((a) => (
          <div key={a.id} className="min-w-0 max-w-full">
            <AttachmentChip attachment={a} />
            <AttachmentPreview attachment={a} />
          </div>
        ))}
      </div>
    </div>
  );
}
