"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { bulkArchiveMessage, runEach } from "@/lib/bulk";
import type { MailThreadSummary } from "@/lib/signal-mail";
import { useToast } from "@/components/shell/toast";

type Pages = InfiniteData<{ items: MailThreadSummary[]; total: number }>;
type Snapshot = [QueryKey, Pages | undefined][];
type Pending = { ids: string[]; target: "Archive" | "Trash"; bulk: boolean; expires: number; undo: () => void; snapshots: Snapshot; timer: ReturnType<typeof setTimeout> };

export function usePendingMove() {
  const client = useQueryClient();
  const toast = useToast();
  const pending = useRef<Pending | null>(null);
  const hidden = useRef(new Set<string>());

  const hide = useCallback(() => {
    for (const [key, data] of client.getQueriesData<Pages>({ queryKey: ["threads"] })) {
      if (!data || !data.pages.some((page) => page.items.some((row) => hidden.current.has(row.id)))) continue;
      const removed = data.pages.flatMap((page) => page.items).filter((row) => hidden.current.has(row.id)).length;
      client.setQueryData(key, { ...data, pages: data.pages.map((page) => ({ ...page, total: Math.max(0, page.total - removed), items: page.items.filter((row) => !hidden.current.has(row.id)) })) });
    }
  }, [client]);

  const restore = useCallback((job: Pending, ids: string[]) => {
    ids.forEach((id) => hidden.current.delete(id));
    for (const [key, snapshot] of job.snapshots) {
      if (!snapshot) continue;
      client.setQueryData<Pages>(key, (current) => {
        if (!current) return snapshot;
        const present = new Set(current.pages.flatMap((page) => page.items.map((row) => row.id)));
        const missing = snapshot.pages.flatMap((page) => page.items).filter((row) => ids.includes(row.id) && !present.has(row.id));
        return { ...current, pages: current.pages.map((page, pageIndex) => {
          const items = [...page.items];
          snapshot.pages[pageIndex]?.items.forEach((row, index) => {
            if (missing.some((item) => item.id === row.id)) items.splice(index, 0, row);
          });
          return { ...page, items, total: page.total + missing.length };
        }) };
      });
    }
  }, [client]);

  const flush = useCallback(() => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    clearTimeout(job.timer);
    toast("");
    void runEach(job.ids, (id) => api.moveThread(id, job.target)).then(({ done, failed }) => {
      if (failed.length) {
        restore(job, failed);
        const next = pending.current;
        toast(job.bulk ? bulkArchiveMessage(done.length, job.ids.length) : "The mail action could not finish. Try again using its control.", next ? { durationMs: Math.max(0, next.expires - Date.now()), action: { label: "Undo", onAction: next.undo } } : undefined);
      }
      done.forEach((id) => hidden.current.delete(id));
      for (const key of ["threads", "thread-counts", "overview", "mail-brief"]) void client.invalidateQueries({ queryKey: [key] });
    });
  }, [client, restore, toast]);

  useEffect(() => {
    // Refetches and live updates must not resurrect a move during its undo window.
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryKey[0] === "threads" && hidden.current.size) hide();
    });
    window.addEventListener("pagehide", flush);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { unsubscribe(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVisibility); flush(); };
  }, [client, flush, hide]);

  return (ids: string[], target: "Archive" | "Trash", bulk = false) => {
    flush();
    void client.cancelQueries({ queryKey: ["threads"] });
    const snapshots = client.getQueriesData<Pages>({ queryKey: ["threads"] });
    ids.forEach((id) => hidden.current.add(id));
    hide();
    const job: Pending = { ids, target, bulk, snapshots, expires: Date.now() + 5000, undo: () => {}, timer: setTimeout(flush, 5000) };
    pending.current = job;
    job.undo = () => {
      if (pending.current !== job) return;
      pending.current = null;
      clearTimeout(job.timer);
      restore(job, ids);
    };
    toast(bulk ? `Archived ${ids.length} conversations` : target === "Archive" ? "Archived" : "Moved to Trash", { action: { label: "Undo", onAction: job.undo } });
  };
}
