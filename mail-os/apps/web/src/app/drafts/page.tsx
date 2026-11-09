"use client";

import { ErrorText } from "@/components/ui";
import { ErrorState } from "@/components/empty-state";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import s from "./page.module.css";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/signal";
import { draftReadiness } from "@/lib/signal-mail";
import { htmlToText } from "@/lib/mail-frame";
import { ComposeModal, loadDraftToContext, type ComposeContext } from "@/components/compose";
import { combineDraftLists } from "@/lib/drafts";
import { formatDateTime } from "@/lib/format";

export default function DraftsPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.mailOverview, enabled: ready });
  const mailboxes = overview.data?.mailboxes ?? [];
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const saved = useQuery({
    queryKey: ["drafts", "signal-mail", ...mailboxIds],
    queryFn: async () => combineDraftLists(await Promise.all(mailboxIds.map((id) => api.listDrafts(id)))),
    enabled: ready && mailboxIds.length > 0,
  });
  const drafts = saved.data ?? [];
  const loading = overview.isPending || (mailboxIds.length > 0 && saved.isPending);
  const failed = overview.isError || saved.isError;
  const [editing, setEditing] = useState<ComposeContext | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDraft(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["drafts"] }),
  });
  if (!ready) return null;
  return (
    <div className={s.page}>
      <PageHeader title="Drafts" description={loading ? "Loading drafts..." : failed ? "Drafts unavailable" : `${drafts.length} saved, ${drafts.filter((draft) => draftReadiness(draft).ready).length} ready to send`} />
      {remove.isError && <ErrorText>Could not discard this draft. Try again.</ErrorText>}
      {failed && <ErrorState title="Drafts could not load" onRetry={() => { void overview.refetch(); void saved.refetch(); }} />}
      {loading ? <p className={s.quiet} role="status">Opening your saved messages...</p> : drafts.length ? <ul className={s.sheets}>{drafts.map((draft) => {
        const readiness = draftReadiness(draft);
        return <li className={s.sheet} key={draft.id}>
          <button className={s.open} onClick={() => setEditing(loadDraftToContext(draft.mailboxConnectionId, draft))}>
            <span className={s.recipient}>{draft.toAddrs ? `To ${draft.toAddrs}` : draft.ccAddrs ? `Cc ${draft.ccAddrs}` : draft.bccAddrs ? `Bcc ${draft.bccAddrs}` : '(no recipient)'}</span>
            <h2>{draft.subject || '(no subject)'}</h2>
            <p>{draft.bodyText || htmlToText(draft.bodyHtml ?? '') || 'No message yet.'}</p>
            <span className={s.recipient}>From {mailboxById.get(draft.mailboxConnectionId)?.email}</span>
            <span className={s.footer}><time dateTime={draft.updatedAt}>{formatDateTime(draft.updatedAt)}</time><StatusChip label={readiness.label} strong={!readiness.ready} /></span>
          </button>
          <button className={s.discard} disabled={remove.isPending} onClick={() => remove.mutate(draft.id)}>Discard</button>
        </li>;
      })}</ul> : !failed && <EmptyState icon={FileText} title="No drafts" text="Messages you start and do not send are kept here" />}
      {editing && (
        <ComposeModal ctx={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
