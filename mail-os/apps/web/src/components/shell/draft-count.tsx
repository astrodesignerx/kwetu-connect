"use client";

import { useAllDrafts } from "@/lib/use-all-drafts";

export function DraftCount() {
  const { drafts } = useAllDrafts();
  return drafts.length > 0 ? (
    <span className="signal-count" aria-label={`${drafts.length} drafts`}>{drafts.length}</span>
  ) : null;
}
