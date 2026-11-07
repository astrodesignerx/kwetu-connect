"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { combineDraftLists } from "@/lib/drafts";

/**
 * Drafts across every accessible mailbox, newest first, with each draft's own
 * mailbox resolvable. Shared by the drafts page and the topbar badge so the two
 * always agree; invalidating ["drafts"] refreshes both.
 */
export function useAllDrafts() {
  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: api.mailOverview,
  });
  const mailboxes = useMemo(() => overview?.mailboxes ?? [], [overview]);
  const mailboxIds = useMemo(() => mailboxes.map((m) => m.id), [mailboxes]);
  const mailboxById = useMemo(() => new Map(mailboxes.map((m) => [m.id, m])), [mailboxes]);
  const { data: drafts } = useQuery({
    queryKey: ["drafts", ...mailboxIds],
    queryFn: async () => {
      const lists = await Promise.all(
        mailboxIds.map((id) => api.listDrafts(id).catch(() => []))
      );
      return combineDraftLists(lists);
    },
    enabled: mailboxIds.length > 0,
  });
  return { mailboxes, mailboxById, drafts: drafts ?? [] };
}
