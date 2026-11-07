import type { MailDraftDto } from "@kompanion/types";

/**
 * Merges per-mailbox draft lists into one newest-first list for the drafts page,
 * so drafts from every accessible mailbox appear and each opens with its own
 * mailbox.
 */
export function combineDraftLists(lists: MailDraftDto[][]): MailDraftDto[] {
  return lists
    .flat()
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}
