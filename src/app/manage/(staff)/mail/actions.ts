"use server";
import MailComposer from "nodemailer/lib/mail-composer";
import { requireStaff } from "@/lib/auth/server";
import { listAccounts, loadAccount, removeAccount, saveAccount, type AccountView } from "@/lib/mail/accounts";
import { detectMailbox } from "@/lib/mail/autoconfig";
import { classify, explain, MAX_ATTACHMENT_BYTES, MailError, normaliseSubject, parseSource, pathOf, testImap, transporter, verifySmtp, withImap, type Address, type MailboxInfo, type ParsedMessage } from "@/lib/mail/client";
import { encryptSecret } from "@/lib/mail/crypto";

/**
 * The manager's Mail page talks to the staff member's own mailbox through these actions. Adapted from the
 * Mjengo suite (Sauti Salama). Every action signs the person in first and only ever opens mailboxes they
 * connected. Failures come back as a readable message instead of a thrown error, because production hides
 * the text of thrown errors.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(what: string, fn: (me: string) => Promise<T>): Promise<Result<T>> {
  const staff = await requireStaff(); // Redirects to sign-in, so it stays outside the try.
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
  email: string;
  password: string;
  /** Only when the servers cannot be worked out from the address. */
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
}

export async function connectMailbox(input: ConnectInput) {
  return run("connect", async (me): Promise<AccountView> => {
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
    } else {
      const found = await detectMailbox(email).catch(() => ({ imap: undefined, smtp: undefined }));
      imap = found.imap; smtp = found.smtp;
      if (!imap || !smtp) throw new MailError("The servers for this address could not be found. Open Server settings and enter them.");
    }
    const servers = { imap_host: imap[0], imap_port: imap[1], imap_secure: imap[2], smtp_host: smtp[0], smtp_port: smtp[1], smtp_secure: smtp[2], username: (input.username?.trim() || email).slice(0, 200) };
    // Prove both directions work before anything is saved.
    try { await testImap(servers, password); } catch (e) { throw new MailError(explain(e)); }
    try { await verifySmtp(servers, password); } catch (e) { throw new MailError("Reading mail works, but sending does not. " + explain(e)); }
    return saveAccount(me, { ...servers, email, label: email, password_enc: encryptSecret(password) });
  });
}

export async function disconnectMailbox(id: string) {
  return run("disconnect", async (me) => { await removeAccount(me, String(id)); return true; });
}

export async function myMailboxes() {
  return run("list", (me) => listAccounts(me));
}

export async function mailFolders(accountId: string) {
  return run("folders", async (me): Promise<{ boxes: MailboxInfo[]; unread: number }> => {
    const account = await loadAccount(me, String(accountId));
    return withImap(account, async (c) => {
      const boxes = classify(await c.list());
      const inbox = pathOf(boxes, "inbox") ?? "INBOX";
      const status = await c.status(inbox, { unseen: true }).catch(() => null);
      return { boxes, unread: status && typeof status === "object" ? status.unseen ?? 0 : 0 };
    });
  });
}

/* Messages */

export interface MessageRow {
  uid: number;
  mailbox: string;
  from: Address;
  to: Address[];
  subject: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
  messageId: string | null;
  /** How many messages in this page share the subject. */
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
        for await (const m of c.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: byUid })) {
          const from = m.envelope?.from?.[0];
          const date = m.envelope?.date ?? (m.internalDate ? new Date(m.internalDate) : null);
          items.push({
            uid: m.uid, mailbox: folder,
            from: { name: from?.name || "", address: from?.address || "" },
            to: (m.envelope?.to ?? []).map((a) => ({ name: a.name || "", address: a.address || "" })),
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
        const counts = new Map<string, number>();
        for (const i of items) counts.set(normaliseSubject(i.subject), (counts.get(normaliseSubject(i.subject)) ?? 0) + 1);
        for (const i of items) i.thread = counts.get(normaliseSubject(i.subject)) ?? 1;
        return { items, total };
      } finally { lock.release(); }
    });
  });
}

export interface ThreadMessage extends ParsedMessage { mailbox: string; seen: boolean; flagged: boolean }

/**
 * A whole conversation in one connection: the opened message, plus the other messages with the same subject in
 * this folder and in Sent, so your own replies read in order. The opened message is marked as read.
 */
export async function mailThread(accountId: string, mailbox: string, uid: number, subject: string) {
  return run("thread", async (me): Promise<ThreadMessage[]> => {
    const account = await loadAccount(me, String(accountId));
    const folder = folderOk(mailbox);
    const opened = uidOk(uid);
    const key = normaliseSubject(String(subject ?? "")).slice(0, 200);
    return withImap(account, async (c) => {
      const boxes = classify(await c.list().catch(() => []));
      const sent = pathOf(boxes, "sent");
      const out: ThreadMessage[] = [];
      for (const path of sent && sent !== folder ? [folder, sent] : [folder]) {
        const lock = await c.getMailboxLock(path);
        try {
          const found = key ? ((await c.search({ subject: key }, { uid: true })) || []) : [];
          const uids = [...new Set(path === folder ? [opened, ...found] : found)].sort((a, b) => b - a).slice(0, 12);
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
      if (!out.some((m) => m.mailbox === folder && m.uid === opened)) throw new MailError("That message is no longer there.");
      return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    });
  });
}

export type MailAction = "archive" | "trash" | "spam" | "inbox" | "read" | "unread" | "star" | "unstar";
const ACTIONS: MailAction[] = ["archive", "trash", "spam", "inbox", "read", "unread", "star", "unstar"];

/** Moves or marks messages. Moving to the bin is reversible, there is no permanent delete here. */
export async function mailAct(accountId: string, mailbox: string, uids: number[], action: MailAction) {
  return run("update", async (me) => {
    const account = await loadAccount(me, String(accountId));
    const folder = folderOk(mailbox);
    if (!ACTIONS.includes(action)) throw new MailError("Choose what to do with the message.");
    const list = (Array.isArray(uids) ? uids : []).slice(0, 200).map(uidOk);
    if (!list.length) return true;
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
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  /** The message this replies to: it is marked answered, which ends its waiting time. */
  answers?: { mailbox: string; uid: number };
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
    const html = String(input.html ?? "").slice(0, 500_000);
    const references = clean(input.references).filter((r) => /^<[^<>\s]+>$/.test(r));
    const inReplyTo = input.inReplyTo && /^<[^<>\s]+>$/.test(input.inReplyTo) ? input.inReplyTo : undefined;
    const message = {
      from: account.email, to, cc: cc.length ? cc : undefined,
      subject: String(input.subject ?? "").trim().slice(0, 300) || "(no subject)",
      html, text: htmlToText(html), inReplyTo, references: references.length ? references : undefined, attachments,
    };
    const raw = await new MailComposer(message).compile().build();
    try {
      await transporter(account).sendMail({ envelope: { from: account.email, to: [...to, ...cc] }, raw });
    } catch (e) { throw new MailError("The message was not sent. " + explain(e)); }
    // cPanel and most hosts do not keep a copy of what SMTP sends, so it is filed in Sent here.
    const fileCopy = !/gmail|googlemail|office365|outlook/i.test(account.smtp_host);
    const answers = input.answers && Number.isInteger(input.answers.uid) && input.answers.uid > 0 && typeof input.answers.mailbox === "string" && input.answers.mailbox.length <= 200 ? input.answers : null;
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
