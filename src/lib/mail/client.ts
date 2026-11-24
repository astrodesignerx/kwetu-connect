import { ImapFlow, type ListResponse } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser, type ParsedMail } from "mailparser";
import sanitizeHtml from "sanitize-html";
import { decryptSecret } from "./crypto";
import { hasRemoteContent } from "./thread";

/**
 * Reading and sending mail straight from the mailbox's own servers (IMAP and SMTP), one short connection per
 * request, so nothing has to run between visits. Adapted from the Mjengo suite's mail client (Sauti Salama),
 * with the Google and Microsoft one-click sign-in and POP3 left out: Kwetu Connect mail is on cPanel.
 */
export interface MailAccount {
  id: string;
  owner_email: string;
  label: string;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  username: string;
  /** The encrypted mailbox password. */
  password_enc: string;
  created_at: string;
  last_synced_at?: string | null;
  last_unread_count?: number;
  last_error?: string | null;
  last_error_at?: string | null;
}

export type Servers = Pick<MailAccount, "imap_host" | "imap_port" | "imap_secure" | "smtp_host" | "smtp_port" | "smtp_secure" | "username">;
type Server = [host: string, port: number, secure: boolean];

export const PRESETS: Record<string, { label: string; imap: Server; smtp: Server; hint?: string }> = {
  kca: { label: "Kwetu Connect mail", imap: ["mail.kwetuconnectads.co.ke", 993, true], smtp: ["mail.kwetuconnectads.co.ke", 465, true], hint: "Use the address and password you sign in to webmail with." },
  gmail: { label: "Gmail or Google Workspace", imap: ["imap.gmail.com", 993, true], smtp: ["smtp.gmail.com", 465, true], hint: "Google needs an app password: Google Account, Security, 2-Step Verification, App passwords." },
  outlook: { label: "Outlook or Microsoft 365", imap: ["outlook.office365.com", 993, true], smtp: ["smtp.office365.com", 587, false], hint: "Your organisation must allow IMAP and SMTP sign-in. Use an app password if 2-step sign-in is on." },
  zoho: { label: "Zoho Mail", imap: ["imap.zoho.com", 993, true], smtp: ["smtp.zoho.com", 465, true] },
  yahoo: { label: "Yahoo Mail", imap: ["imap.mail.yahoo.com", 993, true], smtp: ["smtp.mail.yahoo.com", 465, true], hint: "Yahoo needs an app password." },
};

function imapFor(a: Pick<Servers, "imap_host" | "imap_port" | "imap_secure" | "username">, pass: string) {
  const client = new ImapFlow({
    host: a.imap_host, port: a.imap_port, secure: a.imap_secure, auth: { user: a.username, pass },
    logger: false, socketTimeout: 25_000, greetingTimeout: 15_000, connectionTimeout: 15_000,
  });
  client.on("error", () => undefined); // The awaited call reports it instead.
  return client;
}

export async function withImap<T>(a: MailAccount, fn: (c: ImapFlow) => Promise<T>, budgetMs = 50_000): Promise<T> {
  const client = imapFor(a, decryptSecret(a.password_enc));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { client.close(); reject(new MailError("The mail server took too long to answer. Try again.")); }, budgetMs); });
  try {
    return await Promise.race([(async () => {
      try { await client.connect(); } catch (e) { throw new MailError(explain(e)); }
      return await fn(client);
    })(), timeout]);
  } finally { clearTimeout(timer); client.close(); }
}

/** Vercel refuses request bodies over 4.5 MB, so attachments stop a little below that. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** An error whose message is written for the person using the app and is safe to show them. */
export class MailError extends Error {}

/** Plain-language reason for a connection failure. */
export function explain(e: unknown): string {
  if (e instanceof MailError) return e.message;
  const msg = (e instanceof Error ? e.message : String(e)) + " " + String((e as { code?: string })?.code ?? "");
  const failed = (e as { authenticationFailed?: boolean })?.authenticationFailed;
  if (/certificate|altname|self.signed|CERT_/i.test(msg)) return "The mail server's security certificate does not match its name. Check the server name, or ask your mail host.";
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return "That mail server could not be found. Check the server name.";
  if (failed || /auth|credential|login|password|invalid/i.test(msg)) return "The mailbox did not accept the sign-in. Check the address and password.";
  if (/ETIMEDOUT|timeout/i.test(msg)) return "The mail server took too long to answer. Try again.";
  return "The mailbox could not be reached. Try again in a minute.";
}

export async function testImap(a: Servers, pass: string) {
  const client = imapFor(a, pass);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([client.connect(), new Promise<never>((_, reject) => { timer = setTimeout(() => { client.close(); reject(new Error("timeout")); }, 5_000); })]); }
  finally { clearTimeout(timer); client.close(); }
}

function smtpFor(a: Pick<Servers, "smtp_host" | "smtp_port" | "smtp_secure" | "username">, pass: string) {
  return nodemailer.createTransport({
    host: a.smtp_host, port: a.smtp_port, secure: a.smtp_secure, requireTLS: !a.smtp_secure, auth: { user: a.username, pass },
    connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 15_000, logger: false, debug: false,
  });
}

export async function verifySmtp(a: Servers, pass: string) {
  const transport = smtpFor(a, pass);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([transport.verify(), new Promise<never>((_, reject) => { timer = setTimeout(() => { transport.close(); reject(new Error("timeout")); }, 5_000); })]); }
  finally { clearTimeout(timer); transport.close(); }
}

export function transporter(a: MailAccount) {
  return smtpFor(a, decryptSecret(a.password_enc));
}

/* Folders */

export type Special = "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive" | "starred" | "other";
export interface MailboxInfo { path: string; name: string; special: Special }

const USE: Record<string, Special> = { "\\Sent": "sent", "\\Drafts": "drafts", "\\Trash": "trash", "\\Junk": "spam", "\\Archive": "archive", "\\All": "archive", "\\Flagged": "starred" };

/** Names each folder by its job, from the server's special-use flags or, failing that, its name. */
export function classify(list: Pick<ListResponse, "path" | "name" | "flags" | "specialUse">[]): MailboxInfo[] {
  return list
    .filter((m) => !m.flags?.has("\\Noselect"))
    .map((m) => {
      let special: Special = m.path.toUpperCase() === "INBOX" ? "inbox" : "other";
      if (m.specialUse && USE[m.specialUse]) special = USE[m.specialUse];
      else if (special === "other") {
        const n = m.name.toLowerCase();
        if (/^sent/.test(n)) special = "sent";
        else if (/^draft/.test(n)) special = "drafts";
        else if (/^(trash|deleted)/.test(n)) special = "trash";
        else if (/^(spam|junk)/.test(n)) special = "spam";
        else if (/^archive/.test(n)) special = "archive";
      }
      return { path: m.path, name: m.name, special };
    });
}

export const pathOf = (boxes: MailboxInfo[], s: Special) => boxes.find((b) => b.special === s)?.path;

/* Reading */

export interface Address { name: string; address: string }

const toAddresses = (v: ParsedMail["from"] | ParsedMail["to"] | undefined): Address[] => {
  const list = Array.isArray(v) ? v.flatMap((x) => x.value) : v ? v.value : [];
  return list.map((a) => ({ name: a.name || "", address: a.address || "" }));
};

/**
 * Email HTML is untrusted: formatting and pictures stay, scripts, forms and handlers go. The message is then
 * shown in a sandboxed frame with no scripts, so its CSS cannot reach the app. Insecure http pictures are
 * upgraded to https.
 */
export function cleanHtml(html: string): string {
  const upgrade = (u: string | undefined) => (u ? u.replace(/^\s*http:\/\//i, "https://") : u);
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "span", "font", "center", "style", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "picture", "source"]),
    allowedAttributes: {
      "*": ["style", "align", "width", "height", "bgcolor", "color", "class", "background", "valign", "border", "cellpadding", "cellspacing", "dir"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "alt", "width", "height", "style", "border", "align"],
      source: ["srcset", "media", "type"],
      td: ["colspan", "rowspan", "align", "valign"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid", "data"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "background"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
      img: (tag, attribs) => ({ tagName: "img", attribs: { ...attribs, ...(attribs.src ? { src: upgrade(attribs.src)! } : {}) } }),
    },
    allowProtocolRelative: true,
    allowVulnerableTags: true,
  });
}

export interface ParsedMessage {
  remoteContent?: boolean;
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  date: string | null;
  html: string | null;
  text: string;
  attachments: { index: number; filename: string; size: number; contentType: string; inline: boolean }[];
}

export async function parseSource(uid: number, source: Buffer): Promise<ParsedMessage> {
  const m = await simpleParser(source);
  let html = typeof m.html === "string" ? m.html : null;
  if (html) {
    // Embedded (cid:) pictures are shown in place.
    for (const att of m.attachments ?? []) {
      if (att.cid && att.content) html = html.split(`cid:${att.cid}`).join(`data:${att.contentType};base64,${att.content.toString("base64")}`);
    }
    html = cleanHtml(html);
  }
  return {
    remoteContent: hasRemoteContent(typeof m.html === "string" ? m.html : ""),
    uid,
    messageId: m.messageId ?? null,
    inReplyTo: m.inReplyTo ?? null,
    references: Array.isArray(m.references) ? m.references : m.references ? [m.references] : [],
    subject: m.subject ?? "(no subject)",
    from: toAddresses(m.from),
    to: toAddresses(m.to),
    cc: toAddresses(m.cc),
    date: m.date ? m.date.toISOString() : null,
    html,
    text: m.text ?? "",
    attachments: (m.attachments ?? []).map((a, i) => ({ index: i, filename: a.filename ?? `attachment-${i + 1}`, size: a.size ?? 0, contentType: a.contentType, inline: !!a.cid && a.contentDisposition !== "attachment" })),
  };
}

export const normaliseSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim().toLowerCase();

/** The raw source of one message. */
export async function fetchSource(a: MailAccount, mailbox: string, uid: number): Promise<Buffer> {
  return withImap(a, async (c) => {
    const lock = await c.getMailboxLock(mailbox);
    try {
      const m = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) throw new MailError("That message is no longer there.");
      return m.source;
    } finally { lock.release(); }
  });
}
