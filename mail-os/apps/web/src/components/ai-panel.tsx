"use client";

import { useState } from "react";
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
    <section className={s.summary} aria-label="AI summary">
      <div>
        <button
          type="button"
          onClick={() => {
            if (!generate.isPending) generate.mutate();
          }}
          disabled={generate.isPending}
        >
          {generate.isPending ? "Summarising..." : summary ? "Refresh summary" : "Summarise thread"}
        </button>
        {summary && (
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? "Less detail" : "Full summary"}
          </button>
        )}
      </div>
      {generate.isError && (
        <p role="alert">
          {generate.error instanceof Error ? generate.error.message : "Could not summarize."}
        </p>
      )}
      {summary && <><p>{summary.replace(/^\s*[-*\d.)]+\s*/, "").split(/\n|(?<=[.!?])\s/)[0]}</p>
        <MailDisclosure open={open}><pre>{summary}</pre></MailDisclosure>
        {onNextStep && <button type="button" onClick={onNextStep}>Draft a reply</button>}
      </>}
    </section>
  );
}

export function AiStatusBanner() {
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  if (!data || data.configured) return null;
  return (
    <div className="rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-xs text-brand-black/80 dark:text-brand-cream/80">
      AI actions are disabled until an LLM API key is configured on the server.
    </div>
  );
}

export const TONES = [
  { key: "professional", label: "Professional" },
  { key: "friendly", label: "Friendly" },
  { key: "concise", label: "Concise" },
] as const;
