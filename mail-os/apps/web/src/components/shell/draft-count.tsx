"use client";

import { plural } from "@/lib/format";
import { useAllDrafts } from "@/lib/use-all-drafts";

export function DraftCount() {
  const { drafts } = useAllDrafts();
  return drafts.length > 0 ? (
    <span className="signal-count" aria-label={plural(drafts.length, "draft")}>{drafts.length}</span>
  ) : null;
}
