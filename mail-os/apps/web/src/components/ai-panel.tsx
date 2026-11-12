"use client";

import { useState } from "react";
import { CornerUpLeft, Sparkles } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MailDisclosure } from "@/components/mail/disclosure";
import s from "@/components/mail/compose.module.css";

export function ThreadSummary({ threadId, onNextStep }: { threadId: string; onNextStep?: () => void }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const aiStatus = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  const generate = useMutation({
    mutationFn: () => api.summarize({ threadId }),
    onSuccess: (r) => {
      setSummary(r.summary);
      setOpen(false);
    },
  });

  if (!aiStatus.data?.configured) return null;

  return (
    <section className={s.summary} data-filled={!!summary} aria-label="AI summary">
      <div className={s.summaryActions}>
        {summary ? <>
          <Sparkles size={14} aria-hidden className={s.summarySpark} />
          <p className={s.summaryLine}>{summary.replace(/^\s*[-*\d.)]+\s*/, "").split(/\n|(?<=[.!?])\s/)[0]}</p>
          <button type="button" className="reader-action" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? "Less" : "More"}</button>
          <button type="button" className="reader-action" onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? "Summarising..." : "Refresh"}</button>
        </> : <button type="button" className="reader-action" onClick={() => generate.mutate()} disabled={generate.isPending}><Sparkles size={14} aria-hidden />{generate.isPending ? "Summarising..." : "Summarise"}</button>}
      </div>
      {generate.isError && (
        <p role="alert">
          {generate.error instanceof Error ? generate.error.message : "Could not summarise"}
        </p>
      )}
      {summary && <MailDisclosure open={open}><pre>{summary}</pre>
        {onNextStep && <button type="button" className="reader-action" onClick={onNextStep}><CornerUpLeft size={16} aria-hidden />Draft a reply</button>}
      </MailDisclosure>}
    </section>
  );
}

export function AiStatusBanner() {
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  if (!data || data.configured) return null;
  return (
    <div className="rounded-control border border-line bg-raise px-3 py-2 text-xs text-muted">
      AI actions are disabled until an LLM API key is configured on the server.
    </div>
  );
}

export const TONES = [
  { key: "professional", label: "Professional" },
  { key: "friendly", label: "Friendly" },
  { key: "concise", label: "Concise" },
] as const;
