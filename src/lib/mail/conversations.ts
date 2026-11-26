import type { MessageRow } from "@/app/mail/actions";
import { classify, withImap } from "./client";
import { loadAccount, listAccounts } from "./accounts";
import { demoList, demoFolders, isDemoAccount } from "./demo";
import { conversationKey, emailKey, metaFor, partyOf, threadKey } from "./kca";
import { listMeta, type ThreadMeta } from "./kca-data";
import { isWaiting } from "./status";

export type ConversationRow = MessageRow & { accountId: string };
/** `subjects` holds conversation keys; older subject-only keys still match. */
export type ConversationQuery = { kind: "waiting" } | { kind: "client"; emails: string[] } | { kind: "assigned"; subjects: string[] } | { kind: "followup" };
const snoozed = (meta: ThreadMeta | undefined, now: number) => !!meta?.snoozed_until && Date.parse(meta.snoozed_until) > now;
export function filterConversations(items: MessageRow[], query: ConversationQuery, me: string, inboxPaths = ["INBOX"], meta: ThreadMeta[] = [], now = Date.now()) {
  const emails = query.kind === "client" ? new Set(query.emails.map(emailKey)) : new Set<string>();
  const subjects = query.kind === "assigned" ? new Set(query.subjects) : new Set<string>();
  const sorted = [...items].sort((a,b) => (b.date ?? "").localeCompare(a.date ?? ""));
  // One row per conversation (subject and other party), the newest message, plus when the other party last wrote.
  const groups = new Map<string, { row: MessageRow; party: string; heard: string }>();
  for (const row of sorted) {
    const party = partyOf(row, me), key = conversationKey(row.subject, party);
    const incoming = inboxPaths.includes(row.mailbox) && emailKey(row.from.address) !== emailKey(me);
    const seen = groups.get(key);
    if (seen) { if (incoming && !seen.heard) seen.heard = row.date ?? ""; continue; }
    if (query.kind === "client" && ![row.from, ...row.to, ...(row.cc ?? [])].some((a) => emails.has(emailKey(a.address)))) continue;
    if (query.kind === "assigned" && !subjects.has(key) && !subjects.has(threadKey(row.subject))) continue;
    groups.set(key, { row, party, heard: incoming ? row.date ?? "" : "" });
  }
  const result = [...groups.values()];
  const oldestFirst = (a: MessageRow, b: MessageRow) => (a.date ?? "").localeCompare(b.date ?? "");
  if (query.kind === "waiting") return result.filter(({ row, party }) => {
    const m = metaFor(meta, row.subject, party);
    return inboxPaths.includes(row.mailbox) && !snoozed(m, now) && isWaiting(row, me, m);
  }).map((g) => g.row).sort(oldestFirst);
  // Due, and the other party has not written since the reminder was set.
  if (query.kind === "followup") return result.filter(({ row, party, heard }) => {
    const m = metaFor(meta, row.subject, party);
    return !!m?.remind_at && Date.parse(m.remind_at) <= now && (!heard || heard <= (m.remind_since ?? ""));
  }).map((g) => g.row).sort(oldestFirst);
  return result.map((g) => g.row);
}

/** One connection per account. Searches and reads are bounded; the UI discloses a partial result. */
export async function conversationRows(me: string, query: ConversationQuery, onlyAccount?: string) {
  const accounts = onlyAccount ? [await loadAccount(me, onlyAccount)] : await Promise.all((await listAccounts(me)).map((a) => loadAccount(me, a.id)));
  if (query.kind === "assigned" && !query.subjects.length) return { items: [], partial: false, errors: [] };
  const pairs = await Promise.all(accounts.map(async (account) => [account, ["waiting", "followup"].includes(query.kind) ? await listMeta(me, account.id).catch(() => []) : []] as const));
  // Follow-ups only open the mailboxes that have a reminder due.
  const due = (meta: ThreadMeta[]) => meta.some((m) => m.remind_at && Date.parse(m.remind_at) <= Date.now());
  const results = await Promise.all(pairs.filter(([, meta]) => query.kind !== "followup" || due(meta)).map(async ([account, meta]) => {
    try {
      let partial = false;
      const inboxPaths = ["INBOX"];
      let items: MessageRow[] = [];
      if (isDemoAccount(account)) {
        items = demoFolders(account).boxes.filter((b) => !["spam", "trash", "drafts"].includes(b.special)).flatMap((b) => demoList(account, b.path, {}, 0, 1000).items);
      } else {
        items = await withImap(account, async (c) => {
          const rows: MessageRow[] = [];
          const boxes = classify(await c.list()).filter((b) => !["spam", "trash", "drafts"].includes(b.special) && (!["waiting", "followup"].includes(query.kind) || ["inbox", "sent"].includes(b.special)));
          for (const box of boxes) {
            if (box.special === "inbox") inboxPaths.push(box.path);
            const lock = await c.getMailboxLock(box.path);
            try {
              const search = query.kind === "client" ? { or: query.emails.flatMap((email) => [{ from: email }, { to: email }, { cc: email }]) } : { all: true };
              const found = (await c.search(search, { uid: true }) || []).sort((a,b) => a-b);
              if (found.length > 300) partial = true;
              // Keep recent replies so an older incoming message cannot look unanswered.
              const uids = found.slice(-300);
              if (!uids.length) continue;
              for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true, flags: true }, { uid: true })) {
                const env = m.envelope;
                const addresses = (list: { name?: string; address?: string }[] | undefined) => (list ?? []).map((a) => ({ name: a.name ?? "", address: a.address ?? "" }));
                rows.push({ uid: m.uid, mailbox: box.path, from: addresses(env?.from)[0] ?? { name: "", address: "" }, to: addresses(env?.to), cc: addresses(env?.cc), subject: env?.subject ?? "(no subject)", date: env?.date ? new Date(env.date).toISOString() : null, seen: m.flags?.has("\\Seen") ?? false, flagged: m.flags?.has("\\Flagged") ?? false, answered: m.flags?.has("\\Answered") ?? false, hasAttachments: false, messageId: env?.messageId ?? null, thread: 1 });
              }
            } finally { lock.release(); }
          }
          return rows;
        });
      }
      return { items: filterConversations(items, query, account.email, inboxPaths, meta).map((r) => ({ ...r, accountId: account.id })), partial, error: null };
    } catch { return { items: [], partial: true, error: `Conversations could not be read from ${account.email}.` }; }
  }));
  return { items: results.flatMap((r) => r.items).sort((a,b) => query.kind === "waiting" || query.kind === "followup" ? (a.date ?? "").localeCompare(b.date ?? "") : (b.date ?? "").localeCompare(a.date ?? "")), partial: results.some((r) => r.partial), errors: results.flatMap((r) => r.error ? [r.error] : []) };
}
