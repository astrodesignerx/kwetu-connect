"use server";
import { createHash } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { requireStaff } from "@/lib/auth/server";
import { listAccounts, loadAccount, ownedAccount, removeAccount, saveAccount, recordSync, mailboxPeople, staffDirectory, addMember, removeMember, renameAccount, type AccountView } from "@/lib/mail/accounts";
import { connectionCandidates, detectMailbox } from "@/lib/mail/autoconfig";
import { classify, explain, MAX_ATTACHMENT_BYTES, MailError, normaliseSubject, parseSource, pathOf, testImap, transporter, verifySmtp, withImap, type MailAccount, type Address, type MailboxInfo, type ParsedMessage } from "@/lib/mail/client";
import { saveDraft, listDrafts, deleteDraft, loadUploads, sendOnce, type DraftData } from "@/lib/mail/drafts";
import { encryptSecret } from "@/lib/mail/crypto";
import { moveMessages, undoMove, type MoveKind, type MoveReceipt } from "@/lib/mail/moves";
import { demoAccountFields, demoAct, demoFolders, demoList, demoSend, demoThread, isDemoAccount, mailDemoEnabled } from "@/lib/mail/demo";
import { conversationKey, partyOf, sameConversation } from "@/lib/mail/kca";
import { remindThread } from "@/lib/mail/kca-data";

/**
 * The manager's Mail page talks to the staff member's own mailbox through these actions. Adapted from the
 * Mjengo suite (Sauti Salama). Every action signs the person in first and only ever opens mailboxes they
 * connected. Failures come back as a readable message instead of a thrown error, because production hides
 * the text of thrown errors.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(what: string, fn: (me: string) => Promise<T>): Promise<Result<T>> {
  const staff = await requireStaff("/mail"); // Redirects to sign-in, so it stays outside the try.
  try { return { ok: true, data: await fn(staff.email) }; } catch (e) {
    if (e instanceof MailError) return { ok: false, error: e.message };
    console.error(`Mail ${what} failed:`, e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const emailOk = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
const folderOk = (path: unknown): string => {
  if (typeof path !== "string" || !path || path.length > 200 || /[\r\n]/.test(path)) throw new MailError("Choose a folder.");
  return path;
};
const uidOk = (uid: unknown): number => {
  if (!Number.isInteger(uid) || (uid as number) < 1) throw new MailError("That message is no longer there.");
  return uid as number;
};

/* Mailboxes */

export interface ConnectInput {
  accountId?: string;
  email: string;
  password: string;
  /** Only when the servers cannot be worked out from the address. */
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
}
export async function mailDiscover(email: string) {
  return run("find servers", async () => {
    if (!emailOk(email)) throw new MailError("Enter a valid email address.");
    if (mailDemoEnabled()) return { label: "Sample mail servers", imap: ["demo.invalid", 993, true] as [string, number, boolean], smtp: ["demo.invalid", 465, true] as [string, number, boolean] };
    return detectMailbox(email);
  });
}

export async function connectMailbox(input: ConnectInput) {
  return run("connect", async (me): Promise<AccountView> => {
    const existing = input.accountId ? await ownedAccount(me, input.accountId) : null;
    if (existing && existing.email !== String(input.email).trim().toLowerCase()) throw new MailError("Reconnect with the same email address.");
    // Local demo mode: Connect opens a sample mailbox, no sign-in needed.
    if (mailDemoEnabled()) return saveAccount(me, demoAccountFields(String(input.email ?? "").slice(0, 200)));
    const email = String(input.email ?? "").trim().toLowerCase();
    const password = String(input.password ?? "");
    if (!emailOk(email) || email.length > 200) throw new MailError("Enter a valid email address.");
    if (!password || password.length > 500) throw new MailError("Enter the mailbox password.");
    let imap: [string, number, boolean] | undefined;
    let smtp: [string, number, boolean] | undefined;
    const manualHost = input.imapHost?.trim() && input.smtpHost?.trim();
    if (manualHost) {
      const host = (h: string) => { if (!/^[a-z0-9.-]{3,253}$/i.test(h)) throw new MailError("Enter the server names as they appear in your mail settings, like mail.example.com."); return h.toLowerCase(); };
      const port = (p: unknown, fallback: number) => { const n = Number(p) || fallback; if (!Number.isInteger(n) || n < 1 || n > 65535) throw new MailError("Enter a port between 1 and 65535."); return n; };
      const imapPort = port(input.imapPort, 993);
      const smtpPort = port(input.smtpPort, 465);
      imap = [host(input.imapHost!.trim()), imapPort, imapPort === 993];
      smtp = [host(input.smtpHost!.trim()), smtpPort, smtpPort === 465];
    }
    const username = (input.username?.trim() || email).slice(0, 200);
    const makeServers = (incoming: [string, number, boolean], outgoing: [string, number, boolean]) => ({ imap_host: incoming[0], imap_port: incoming[1], imap_secure: incoming[2], smtp_host: outgoing[0], smtp_port: outgoing[1], smtp_secure: outgoing[2], username });
    const found = manualHost ? null : await detectMailbox(email).catch(() => ({ label: email.split("@")[1] }));
    const candidates = found ? connectionCandidates(email, found) : null;
    const incoming = imap ? [imap] : candidates!.imap;
    let lastError: unknown;
    let servers: ReturnType<typeof makeServers> | undefined;
    for (const candidate of incoming) {
      try { const trial = makeServers(candidate, smtp ?? [candidate[0], 465, true]); await testImap(trial, password); imap = candidate; servers = trial; break; }
      catch (e) { lastError = e; if (/sign-in/.test(explain(e))) break; }
    }
    if (!servers || !imap) throw new MailError("IMAP sign-in failed. " + explain(lastError) + " Open Server settings to check the incoming server.");
    let sendingWorks = false;
    for (const candidate of smtp ? [smtp] : candidates!.smtp(imap[0])) {
      try { const trial = makeServers(imap, candidate); await verifySmtp(trial, password); servers = trial; sendingWorks = true; break; }
      catch (e) { lastError = e; if (/sign-in/.test(explain(e))) break; }
    }
    if (!sendingWorks) throw new MailError("SMTP sign-in failed. Reading mail works, but sending does not. " + explain(lastError) + " Open Server settings to check the outgoing server.");
    return saveAccount(me, { ...servers, email, label: email.slice(0, 60), password_enc: encryptSecret(password) });
  });
}

export async function disconnectMailbox(id: string) {
  return run("disconnect", async (me) => { await removeAccount(me, String(id)); return true; });
}

export async function myMailboxes() {
  return run("list", (me) => listAccounts(me));
}
export async function mailSharing(id: string) {
  return run("read sharing", async (me) => {
    const account = await loadAccount(me, id);
    return { me, owner: account.owner_email, people: await mailboxPeople(me, id), staff: account.owner_email === me.toLowerCase() ? await staffDirectory() : [] };
  });
}
export async function mailAddMember(id: string, email: string) { return run("share", async (me) => { await addMember(me, id, email); return true; }); }
export async function mailRemoveMember(id: string, email: string) { return run("remove member", async (me) => { await removeMember(me, id, email); return true; }); }
export async function mailRename(id: string, label: string) { return run("rename", async (me) => { await renameAccount(me, id, label); return true; }); }
export async function mailServerSettings(id: string) {
  return run("read settings", async (me) => {
    const a = await ownedAccount(me, id);
    return { imap_host:a.imap_host, imap_port:a.imap_port, smtp_host:a.smtp_host, smtp_port:a.smtp_port, username:a.username };
  });
}

export async function mailFolders(accountId: string) {
  return run("folders", async (me): Promise<{ boxes: MailboxInfo[]; unread: number }> => {
    const account = await loadAccount(me, String(accountId));
    if (isDemoAccount(account)) { const result = demoFolders(account); await recordSync(account.id, result.unread, null); return result; }
    return withImap(account, async (c) => {
      const boxes = classify(await c.list());
      const inbox = pathOf(boxes, "inbox") ?? "INBOX";
      const status = await c.status(inbox, { unseen: true });
      const unread = status && typeof status === "object" ? status.unseen ?? 0 : 0;
      await recordSync(account.id, unread, null);
      return { boxes, unread };

    });
  });
}

/* Messages */

export interface MessageRow {
  snippet?: string;
  uid: number;
  mailbox: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
  messageId: string | null;
  /** How many messages in this page belong to the same conversation (subject and other party). */
  thread: number;
}

export interface ListQuery { unread?: boolean; flagged?: boolean; text?: string }

function hasAttachment(node: { disposition?: string; childNodes?: unknown[] } | undefined): boolean {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  return (node.childNodes ?? []).some((n) => hasAttachment(n as { disposition?: string; childNodes?: unknown[] }));
}

/** One page of a folder, newest first. A filter or search asks the server and pages through the matches. */
export async function mailList(accountId: string, mailbox: string, query: ListQuery = {}, offset = 0, limit = 40) {
  return run("list", async (me): Promise<{ items: MessageRow[]; total: number }> => {
    const account = await loadAccount(me, String(accountId));
    const folder = folderOk(mailbox);
    const text = String(query.text ?? "").trim().slice(0, 200);
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.min(60, Math.max(1, Math.floor(Number(limit) || 40)));
    if (folder === "__starred__") return starredMessages(account, text, !!query.unread, start, size);
    if (isDemoAccount(account)) return demoList(account, folder, { unread: !!query.unread, flagged: !!query.flagged, text }, start, size);
    return withImap(account, async (c) => {
      const lock = await c.getMailboxLock(folder);
      try {
        let range: string;
        let byUid = false;
        let total: number;
        if (query.unread || query.flagged || text) {
          const search: Record<string, unknown> = {};
          if (query.unread) search.seen = false;
          if (query.flagged) search.flagged = true;
          if (text) search.or = [{ subject: text }, { from: text }, { body: text }];
          const uids = ((await c.search(search, { uid: true })) || []).sort((a, b) => b - a);
          total = uids.length;
          const page = uids.slice(start, start + size);
          if (!page.length) return { items: [], total };
          range = page.join(",");
          byUid = true;
        } else {
          const exists = (typeof c.mailbox === "object" ? c.mailbox.exists : 0) || 0;
          total = exists;
          const end = exists - start;
          if (end < 1) return { items: [], total };
          range = `${Math.max(1, end - size + 1)}:${end}`;
        }
        const items: MessageRow[] = [];
        for await (const m of c.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true, source: { start: 0, maxLength: 4096 } }, { uid: byUid })) {
          const from = m.envelope?.from?.[0];
          const date = m.envelope?.date ?? (m.internalDate ? new Date(m.internalDate) : null);
          let snippet = "";
          if (m.source) try { snippet = (await parseSource(m.uid, m.source)).text.replace(/\s+/g, " ").trim().slice(0, 160); } catch {}
          items.push({
            snippet,
            uid: m.uid, mailbox: folder,
            from: { name: from?.name || "", address: from?.address || "" },
            to: (m.envelope?.to ?? []).map((a) => ({ name: a.name || "", address: a.address || "" })),
            cc: (m.envelope?.cc ?? []).map((a) => ({ name: a.name || "", address: a.address || "" })),
            subject: m.envelope?.subject || "(no subject)",
            date: date ? new Date(date).toISOString() : null,
            seen: m.flags?.has("\\Seen") ?? false,
            flagged: m.flags?.has("\\Flagged") ?? false,
            answered: m.flags?.has("\\Answered") ?? false,
            hasAttachments: hasAttachment(m.bodyStructure as never),
            messageId: m.envelope?.messageId ?? null,
            thread: 1,
          });
        }
        items.sort((a, b) => b.uid - a.uid);
        const counts = new Map<string, number>(), key = (i: MessageRow) => conversationKey(i.subject, partyOf(i, account.email));
        for (const i of items) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
        for (const i of items) i.thread = counts.get(key(i)) ?? 1;
        return { items, total };
      } finally { lock.release(); }
    });
  });
}

export interface ThreadMessage extends ParsedMessage { mailbox: string; seen: boolean; flagged: boolean }

/**
 * A whole conversation in one connection: the opened message, plus the other messages in the same conversation in
 * this folder and in Sent, so your own replies read in order. The opened message is marked as read.
 */
export async function mailThread(accountId: string, mailbox: string, uid: number, subject: string) {
  return run("thread", async (me): Promise<ThreadMessage[]> => {
    const account = await loadAccount(me, String(accountId));
    const folder = folderOk(mailbox);
    const opened = uidOk(uid);
    const key = normaliseSubject(String(subject ?? "")).slice(0, 200);
    if (isDemoAccount(account)) return demoThread(account, folder, opened, key);
    return withImap(account, async (c) => {
      const boxes = classify(await c.list().catch(() => []));
      const sent = pathOf(boxes, "sent");
      const out: ThreadMessage[] = [];
      for (const path of sent && sent !== folder ? [folder, sent] : [folder]) {
        const lock = await c.getMailboxLock(path);
        try {
          const found = key ? ((await c.search({ subject: key }, { uid: true })) || []) : [];
          const recent = found.sort((a, b) => b - a);
          const uids = path === folder
            ? [opened, ...recent.filter((u) => u !== opened).slice(0, 29)]
            : recent.slice(0, 30);
          if (!uids.length) continue;
          for await (const m of c.fetch(uids.join(","), { uid: true, flags: true, source: true }, { uid: true })) {
            if (!m.source) continue;
            const isOpened = path === folder && m.uid === opened;
            try {
              const parsed = await parseSource(m.uid, m.source);
              if (!isOpened && normaliseSubject(parsed.subject) !== key) continue;
              out.push({ ...parsed, mailbox: path, seen: isOpened || (m.flags?.has("\\Seen") ?? false), flagged: m.flags?.has("\\Flagged") ?? false });
            } catch { /* One message that will not parse is left out. */ }
          }
          if (path === folder) await c.messageFlagsAdd(String(opened), ["\\Seen"], { uid: true }).catch(() => undefined);
        } finally { lock.release(); }
      }
      const openedMessage = out.find((m) => m.mailbox === folder && m.uid === opened);
      if (!openedMessage) throw new MailError("That message is no longer there.");
      const conversation = sameConversation(openedMessage, out, account.email);
      const newest = (a: ThreadMessage, b: ThreadMessage) => (b.date ?? "").localeCompare(a.date ?? "") || b.uid - a.uid;
      const keep = (path: string) => {
        const rows = conversation.filter((m) => m.mailbox === path);
        return path === folder ? [openedMessage, ...rows.filter((m) => m.uid !== opened).sort(newest).slice(0, 11)] : rows.sort(newest).slice(0, 12);
      };
      const kept = sent && sent !== folder ? [...keep(folder), ...keep(sent)] : keep(folder);
      return kept.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.uid - b.uid);
    });
  });
}

export type MailAction = "archive" | "trash" | "spam" | "inbox" | "read" | "unread" | "star" | "unstar";
const ACTIONS: MailAction[] = ["archive", "trash", "spam", "inbox", "read", "unread", "star", "unstar"];
export async function mailMove(accountId: string, mailbox: string, uids: number[], action: MoveKind) {
  return run("move", async (me) => {
    const account = await loadAccount(me, accountId);
    if (!["archive", "trash", "spam", "inbox"].includes(action)) throw new MailError("Choose a destination.");
    return moveMessages(account, folderOk(mailbox), uids, action);
  });
}
export async function mailUndoMove(receipt: MoveReceipt) {
  return run("undo move", async (me) => { await undoMove(await loadAccount(me, receipt.accountId), receipt); return true; });
}

/** Moves or marks messages. Moving to the bin is reversible, there is no permanent delete here. */
export async function mailAct(accountId: string, mailbox: string, uids: number[], action: MailAction) {
  return run("update", async (me) => {
    const account = await loadAccount(me, String(accountId));
    const folder = folderOk(mailbox);
    if (!ACTIONS.includes(action)) throw new MailError("Choose what to do with the message.");
    const list = (Array.isArray(uids) ? uids : []).slice(0, 200).map(uidOk);
    if (!list.length) return true;
    if (isDemoAccount(account)) { demoAct(account, folder, list, action); return true; }
    const set = list.join(",");
    await withImap(account, async (c) => {
      const boxes = classify(await c.list());
      const lock = await c.getMailboxLock(folder);
      try {
        switch (action) {
          case "read": await c.messageFlagsAdd(set, ["\\Seen"], { uid: true }); break;
          case "unread": await c.messageFlagsRemove(set, ["\\Seen"], { uid: true }); break;
          case "star": await c.messageFlagsAdd(set, ["\\Flagged"], { uid: true }); break;
          case "unstar": await c.messageFlagsRemove(set, ["\\Flagged"], { uid: true }); break;
          default: {
            const target = pathOf(boxes, action === "inbox" ? "inbox" : action);
            if (!target) throw new MailError(action === "archive" ? "This mailbox has no Archive folder." : action === "spam" ? "This mailbox has no Spam folder." : "This mailbox has no Bin folder.");
            if (target !== folder) await c.messageMove(set, target, { uid: true });
          }
        }
      } finally { lock.release(); }
    });
    return true;
  });
}

/* Sending */

export interface SendInput {
  accountId: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[];
  draftId?: string;
  expectedVersion?: number;
  uploadIds?: string[];
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  /** The message this replies to: it is marked answered, which ends its waiting time. */
  answers?: { mailbox: string; uid: number };
  /** List the conversation under "No reply yet" if the recipient has not written back after this many days. */
  remindDays?: number;
}

const htmlToText = (html: string) =>
  html.replace(/<(br|\/p|\/div|\/h[1-6]|\/li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();

export async function mailSend(input: SendInput) {
  return run("send", async (me) => {
    const account = await loadAccount(me, String(input.accountId));
    const clean = (list: unknown) => (Array.isArray(list) ? list : []).map((e) => String(e).trim()).filter(Boolean).slice(0, 50);
    const to = clean(input.to);
    const cc = clean(input.cc);
    if (!to.length) throw new MailError("Add at least one recipient.");
    const bad = [...to, ...cc].find((e) => !emailOk(e));
    if (bad) throw new MailError(`"${bad.slice(0, 80)}" is not a valid email address.`);
    const attachments = (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 10).map((a) => ({
      filename: String(a.filename).slice(0, 200), content: Buffer.from(String(a.contentBase64), "base64"), contentType: String(a.contentType || "application/octet-stream").slice(0, 120),
    }));
    if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_ATTACHMENT_BYTES) throw new MailError("Attachments can be up to 4 MB in total.");
    const staged = await loadUploads(me, input.draftId ?? "", input.uploadIds ?? []);
    attachments.push(...staged.map((a) => ({ filename: a.file_name, content: Buffer.from(a.data_base64, "base64"), contentType: a.content_type })));
    const html = String(input.html ?? "").slice(0, 500_000);
    const references = clean(input.references).filter((r) => /^<[^<>\s]+>$/.test(r));
    const inReplyTo = input.inReplyTo && /^<[^<>\s]+>$/.test(input.inReplyTo) ? input.inReplyTo : undefined;
    const message = {
      from: account.email, to, cc: cc.length ? cc : undefined,
      subject: String(input.subject ?? "").trim().slice(0, 300) || "(no subject)",
      html, text: htmlToText(html), inReplyTo, references: references.length ? references : undefined, attachments,
    };
    const answers = input.answers && Number.isInteger(input.answers.uid) && input.answers.uid > 0 && typeof input.answers.mailbox === "string" && input.answers.mailbox.length <= 200 ? input.answers : null;
    const raw = await new MailComposer(message).compile().build();
    const fingerprint = { ...message, attachments: attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, hash: createHash("sha256").update(a.content).digest("hex") })) };
    const submitted = await sendOnce(me, input.draftId ?? "", account.id, input.expectedVersion ?? -1, fingerprint, async () => {
      if (isDemoAccount(account)) { demoSend(account, { to, cc, subject: message.subject, html, text: message.text, inReplyTo, attachments }, answers); return; }
      const transport = transporter(account);
      try { await transport.sendMail({ envelope: { from: account.email, to: [...to, ...cc] }, raw }); }
      finally { transport.close?.(); }
    });
    // A reminder is a convenience: a failure to save it never turns a sent email into an error.
    const remindDays = [1, 2, 3, 7, 14].includes(Number(input.remindDays)) ? Number(input.remindDays) : 0;
    if (submitted && remindDays) await remindThread(me, account.id, message.subject, partyOf({ from: [], to: to.map((address) => ({ address })) }, account.email), new Date(Date.now() + remindDays * 86_400_000).toISOString()).catch(() => undefined);
    if (!submitted || isDemoAccount(account)) return true;
    // cPanel and most hosts do not keep a copy of what SMTP sends, so it is filed in Sent here.
    const fileCopy = !/gmail|googlemail|office365|outlook/i.test(account.smtp_host);
    if (fileCopy || answers) {
      await withImap(account, async (c) => {
        if (fileCopy) {
          const sent = pathOf(classify(await c.list()), "sent");
          if (sent) await c.append(sent, raw, ["\\Seen"]);
        }
        if (answers) {
          const lock = await c.getMailboxLock(answers.mailbox);
          try { await c.messageFlagsAdd(String(answers.uid), ["\\Answered"], { uid: true }); } finally { lock.release(); }
        }
      }).catch(() => undefined);
    }
    return true;
  });
}

export async function mailSaveDraft(id: string, accountId: string, version: number, data: DraftData) {
  return run("save draft", (me) => saveDraft(me, id, accountId, version, data));
}
export async function mailDrafts(accountId: string) {
  return run("read drafts", (me) => listDrafts(me, accountId));
}
export async function mailDeleteDraft(id: string, version: number) {
  return run("delete draft", async (me) => { await deleteDraft(me, id, version); return true; });
}
export async function mailDraftUploads(id: string, ids: string[]) {
  return run("read attachments", async (me) => (await loadUploads(me, id, ids)).map((u) => ({ id: u.id, file_name: u.file_name, size_bytes: u.size_bytes })));
}
/** Mailbox status from the database, kept fresh by the background check. Cheap enough to poll from a hidden tab. */
export async function mailStatus() {
  return run("read mailbox status", (me) => listAccounts(me));
}
export async function mailUnreadCount() {
  return run("read unread count", async (me) => (await listAccounts(me)).reduce((n, a) => n + (a.last_unread_count ?? 0), 0));
}

async function starredMessages(account: MailAccount, text: string, unread: boolean, offset: number, size: number) {
  if (isDemoAccount(account)) {
    const items = demoFolders(account).boxes.flatMap((box) => demoList(account, box.path, { flagged: true, text, unread }, 0, 1000).items).sort((a,b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { items: items.slice(offset, offset + size), total: items.length };
  }
  return withImap(account, async (client) => {
    const items: MessageRow[] = [];
    let total = 0;
    for (const box of classify(await client.list()).filter((b) => b.special !== "starred")) {
      const lock = await client.getMailboxLock(box.path);
      try {
        const query: Record<string, unknown> = { flagged: true };
        if (unread) query.seen = false;
        if (text) query.or = [{ subject: text }, { from: text }, { body: text }];
        const matches = (await client.search(query, { uid: true }) || []).sort((a,b) => b-a);
        total += matches.length;
        if (!matches.length) continue;
        for await (const m of client.fetch(matches.slice(0, offset + size).join(","), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: true })) {
          const from = m.envelope?.from?.[0];
          const date = m.envelope?.date ?? m.internalDate;
          items.push({ uid: m.uid, mailbox: box.path, from: { name: from?.name || "", address: from?.address || "" }, to: (m.envelope?.to ?? []).map((a) => ({ name: a.name || "", address: a.address || "" })), subject: m.envelope?.subject || "(no subject)", date: date ? new Date(date).toISOString() : null, seen: m.flags?.has("\\Seen") ?? false, flagged: true, answered: m.flags?.has("\\Answered") ?? false, hasAttachments: hasAttachment(m.bodyStructure as never), messageId: m.envelope?.messageId ?? null, thread: 1 });
        }
      } finally { lock.release(); }
    }
    items.sort((a,b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { items: items.slice(offset, offset + size), total };
  });
}
