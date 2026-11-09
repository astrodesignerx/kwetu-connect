"use client";

import { ErrorText } from "@/components/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { AttachmentDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { ShellDialog } from "@/components/shell/dialog";
import s from "./compose.module.css";

const images = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export function AttachmentPreview({ attachment }: { attachment: AttachmentDto }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const titleId = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const image = images.includes(attachment.contentType ?? "");
  if (!image && attachment.contentType !== "application/pdf") return null;
  return <>
    <button type="button" className={s.assistAction} disabled={busy} onClick={async () => {
      setBusy(true); setError(false);
      try {
        const blob = await api.downloadAttachment(attachment.id);
        if (!alive.current) return;
        setUrl(URL.createObjectURL(new Blob([blob], { type: attachment.contentType! })));
        setOpen(true);
      } catch { if (alive.current) setError(true); }
      finally { if (alive.current) setBusy(false); }
    }}>{busy ? "Loading preview..." : `Preview ${attachment.fileName}`}</button>
    {error && <ErrorText>Preview could not load. Try downloading the file.</ErrorText>}
    <ShellDialog open={open} onClose={() => { setOpen(false); setUrl(null); }} labelId={titleId}>
      <div className={s.previewPanel}><h2 id={titleId}>{attachment.fileName}</h2>
        <button type="button" onClick={() => { setOpen(false); setUrl(null); }}>Close preview</button>
        {url && (image ?
          // Authenticated local blob URLs cannot use the image optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.fileName} /> : <iframe title={attachment.fileName} src={url} sandbox="" />)}
      </div>
    </ShellDialog>
  </>;
}
