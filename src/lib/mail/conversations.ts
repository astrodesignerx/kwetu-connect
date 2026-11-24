import type { MessageRow } from "@/app/mail/actions";
import { classify, withImap } from "./client";
import { loadAccount, listAccounts } from "./accounts";
import { demoList, demoFolders, isDemoAccount } from "./demo";
import { emailKey, threadKey } from "./kca";

export type ConversationRow = MessageRow & { accountId: string };
export type ConversationQuery = { kind: "waiting" } | { kind: "client"; emails: string[] } | { kind: "assigned"; subjects: string[] };
export function filterConversations(items: MessageRow[], query: ConversationQuery, me: string, inboxPaths = ["INBOX"]) {
  const emails = query.kind === "client" ? new Set(query.emails.map(emailKey)) : new Set<string>();
  const subjects = query.kind === "assigned" ? new Set(query.subjects) : new Set<string>();
  const sorted = [...items].sort((a,b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const groups = new Map<string, MessageRow>();
  for (const row of sorted) {
    const key = threadKey(row.subject);
    if (groups.has(key)) continue;
    if (query.kind === "client" && ![row.from, ...row.to, ...(row.cc ?? [])].some((a) => emails.has(emailKey(a.address)))) continue;
    if (query.kind === "assigned" && !subjects.has(key)) continue;
    groups.set(key, row);
  }
  const result = [...groups.values()];
  return query.kind === "waiting" ? result.filter((r) => inboxPaths.includes(r.mailbox) && !r.answered && emailKey(r.from.address) !== emailKey(me) && !/^(no-?reply|notifications?|alerts?)@/i.test(r.from.address)).sort((a,b) => (a.date ?? "").localeCompare(b.date ?? "")) : result;
}

/** One connection per account. Searches and reads are bounded; the UI discloses a partial result. */
export async function conversationRows(me: string, query: ConversationQuery, onlyAccount?: string) {
  const accounts = onlyAccount ? [await loadAccount(me, onlyAccount)] : await Promise.all((await listAccounts(me)).map((a) => loadAccount(me, a.id)));
  if (query.kind === "assigned" && !query.subjects.length) return { items: [], partial: false, errors: [] };
  const results = await Promise.all(accounts.map(async (account) => {
    try {
      let partial = false;
      const inboxPaths = ["INBOX"];
      let items: MessageRow[] = [];
      if (isDemoAccount(account)) {
        items = demoFolders(account).boxes.filter((b) => !["spam", "trash", "drafts"].includes(b.special)).flatMap((b) => demoList(account, b.path, {}, 0, 1000).items);
      } else {
        items = await withImap(account, async (c) => {
          const rows: MessageRow[] = [];
          const boxes = classify(await c.list()).filter((b) => !["spam", "trash", "drafts"].includes(b.special) && (query.kind !== "waiting" || ["inbox", "sent"].includes(b.special)));
          for (const box of boxes) {
            if (box.special === "inbox") inboxPaths.push(box.path);
            const lock = await c.getMailboxLock(box.path);
            try {
              const search = query.kind === "client" ? { or: query.emails.flatMap((email) => [{ from: email }, { to: email }, { cc: email }]) } : { all: true };
              const found = (await c.search(search, { uid: true }) || []).sort((a,b) => a-b);
              if (found.length > 300) partial = true;
              // Waiting needs the oldest messages. Client and Assigned show the newest page.
              const uids = query.kind === "waiting" ? found.slice(0,300) : found.slice(-300);
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
      return { items: filterConversations(items, query, account.email, inboxPaths).map((r) => ({ ...r, accountId: account.id })), partial, error: null };
    } catch { return { items: [], partial: true, error: `Conversations could not be read from ${account.email}.` }; }
  }));
  return { items: results.flatMap((r) => r.items).sort((a,b) => query.kind === "waiting" ? (a.date ?? "").localeCompare(b.date ?? "") : (b.date ?? "").localeCompare(a.date ?? "")), partial: results.some((r) => r.partial), errors: results.flatMap((r) => r.error ? [r.error] : []) };
}
