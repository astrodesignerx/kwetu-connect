import { MailError, normaliseSubject, type MailAccount, type MailboxInfo, type ParsedMessage } from "./client";
import type { MoveKind, MoveReceipt } from "./moves";
import { conversationKey, partyOf, sameConversation } from "./kca";

/**
 * A sample mailbox for local demo mode, so the Mail page can be tried without a real mailbox. It only ever
 * switches on under `next dev` with Supabase not configured, so the live site and the tests
 * always talks to real mail servers. Nothing here leaves the computer: sending just files a copy in Sent.
 */
export const DEMO_HOST = "demo.invalid";

export function mailDemoEnabled() {
  const supabase = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].every((v) => v?.trim());
  return process.env.NODE_ENV === "development" && !supabase;
}

export const isDemoAccount = (a: Pick<MailAccount, "imap_host">) => a.imap_host === DEMO_HOST;

export function demoAccountFields(email: string) {
  const address = email.trim().toLowerCase() || "you@kwetuconnectads.co.ke";
  return {
    email: address, label: address, username: address, password_enc: "demo",
    imap_host: DEMO_HOST, imap_port: 993, imap_secure: true, smtp_host: DEMO_HOST, smtp_port: 465, smtp_secure: true,
  };
}

const FOLDERS: MailboxInfo[] = [
  { path: "INBOX", name: "Inbox", special: "inbox" },
  { path: "Sent", name: "Sent", special: "sent" },
  { path: "Drafts", name: "Drafts", special: "drafts" },
  { path: "Archive", name: "Archive", special: "archive" },
  { path: "Spam", name: "Spam", special: "spam" },
  { path: "Trash", name: "Trash", special: "trash" },
];

interface DemoMessage extends ParsedMessage { files?: { filename: string; content: Buffer; contentType: string }[]; mailbox: string; seen: boolean; flagged: boolean; answered: boolean }
interface DemoBox { nextUid: number; messages: DemoMessage[] }

type Shared = typeof globalThis & { kcaMailDemo?: Map<string, DemoBox> };
const shared = globalThis as Shared;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const para = (lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("");

/** Sample conversations. Every name, business and number is made up. */
function seed(me: string): DemoBox {
  const you = { name: "", address: me };
  const rows: Omit<DemoMessage, "uid">[] = [];
  const add = (m: { mailbox?: string; from: { name: string; address: string }; to?: { name: string; address: string }[]; subject: string; hours: number; body: string[]; seen?: boolean; flagged?: boolean; answered?: boolean; attachment?: string }) => {
    const id = `<demo-${rows.length + 1}@kwetuconnectads.co.ke>`;
    rows.push({
      mailbox: m.mailbox ?? "INBOX", messageId: id, inReplyTo: null, references: [],
      subject: m.subject, from: [m.from], to: m.to ?? [you], cc: [], date: hoursAgo(m.hours),
      html: para(m.body), text: m.body.join("\n\n"),
      attachments: m.attachment ? [{ index: 0, filename: m.attachment, size: 95, contentType: "text/plain", inline: false }] : [],
      seen: m.seen ?? false, flagged: m.flagged ?? false, answered: m.answered ?? false,
    });
  };
  const amina = { name: "Amina Wanjiru", address: "amina@eldoretbakery.example" };
  add({ from: amina, subject: "Booking for the Kisumu Ndogo Road screen in December", hours: 70, seen: true, answered: true, body: ["Hello,", "We would like to run our festive advert on the Kisumu Ndogo Road screen for two weeks from 1 December. Morning and evening rush hours if possible.", "Could you send a quote?", "Thanks,<br>Amina"] });
  add({ mailbox: "Sent", from: you, to: [amina], subject: "Re: Booking for the Kisumu Ndogo Road screen in December", hours: 66, seen: true, body: ["Hi Amina,", "Thank you for getting in touch. Two weeks of morning and evening slots comes to KES 84,000. I have held the dates for you until Friday.", "Kind regards,<br>Kwetu Connect Advertising"] });
  add({ from: amina, subject: "Re: Booking for the Kisumu Ndogo Road screen in December", hours: 3, flagged: true, body: ["That works for us. I have attached the campaign brief for our Eldoret bakery.", "Please confirm once it is approved.", "Amina"], attachment: "eldoret-festive-brief.txt" });
  add({ from: { name: "M-Pesa Paybill", address: "notifications@payments.example" }, subject: "Payment received: KES 42,000 from Rift Motors", hours: 5, body: ["You have received KES 42,000.00 from RIFT MOTORS LTD, account KCA-1187.", "This is a sample notification."] });
  add({ from: { name: "Brian Otieno", address: "brian@riftmotors.example" }, subject: "Deposit paid for the November campaign", hours: 6, seen: true, body: ["Hi team,", "We have paid the 50% deposit this morning. When can we see the first proof on screen?", "Brian"] });
  add({ from: { name: "Grace Muthoni", address: "grace@eldoretarts.example" }, subject: "Question about advert length", hours: 26, body: ["Good afternoon,", "Is a 15 second advert allowed, or do you only take 10 seconds?", "Grace"] });
  // Same subject, different client: a separate conversation.
  add({ from: { name: "Joseph Njoroge", address: "joseph@nakurugrill.example" }, subject: "Question about advert length", hours: 40, seen: true, body: ["Hello,", "How long can a restaurant advert be? We have a 30 second clip.", "Joseph"] });
  add({ from: { name: "Screen monitor", address: "alerts@kwetuconnectads.co.ke" }, subject: "Weekly screen report: 99.2% on air", hours: 30, seen: true, body: ["The screen was on air 99.2% of scheduled hours this week.", "Longest break: 12 minutes on Tuesday, power."] });
  add({ mailbox: "Archive", from: { name: "Peter Kamau", address: "peter@greenleafhotel.example" }, subject: "Thank you for October", hours: 400, seen: true, body: ["The October campaign brought us many bookings. We will be back in the new year.", "Peter"] });
  add({ mailbox: "Spam", from: { name: "Prize Desk", address: "winner@prizes.example" }, subject: "You have won a holiday", hours: 12, body: ["Click here to claim."] });
  add({ mailbox: "Drafts", from: you, to: [{ name: "Grace Muthoni", address: "grace@eldoretarts.example" }], subject: "Re: Question about advert length", hours: 1, seen: true, body: ["Hi Grace,", "Yes, 15 seconds is fine. It"] });
  add({from:{name:"David Otieno",address:"DAVID@example.com"},subject:"Checking our screen run",hours:18,body:["Hello team, can you confirm the dates for our pharmacy advert?", "Thank you, David"]});
  add({from:{name:"Agnes Jeptoo",address:"agnes@example.com"},subject:"Advert attached for review",hours:10,body:["Please review the attached picture for our booking KCA-DE40000000000010."]});
  rows[rows.length-1].attachments=[{index:0,filename:"sample-advert.png",size:1992,contentType:"image/png",inline:false}];
  add({from:{name:"Payment desk",address:"payments@example.net"},subject:"Payment note for KCA-DE40000000000012",hours:8,body:["Please check the payment for this booking in the manager."]});
  add({from:{name:"Mercy Kiplagat",address:"mercy@eldoretflowers.example"},subject:"December flower promotion pictures",hours:2,body:["Hello, here is a picture for our Eldoret flower promotion.", '<img src="https://kwetuconnectads.co.ke/logo-icon.svg" alt="Sample promotion picture" width="320" height="180">', "Please let us know what else you need."]});
  const selectedRows = me.startsWith("studio@") ? rows.filter((m) => ["agnes@example.com", "DAVID@example.com", "alerts@kwetuconnectads.co.ke"].includes(m.from[0]?.address)) : rows;
  if (me.startsWith("studio@")) for (const row of selectedRows) row.subject = "Studio: " + row.subject;
  return { nextUid: rows.length + 1, messages: selectedRows.map((m, i) => ({ ...m, uid: i + 1 })) };
}

function box(account: MailAccount): DemoBox {
  const all = (shared.kcaMailDemo ??= new Map());
  let b = all.get(account.id);
  if (!b) { b = seed(account.email); all.set(account.id, b); }
  return b;
}

export function demoFolders(account: MailAccount) {
  return { boxes: FOLDERS, unread: box(account).messages.filter((m) => m.mailbox === "INBOX" && !m.seen).length };
}

export function demoList(account: MailAccount, folder: string, query: { unread?: boolean; flagged?: boolean; text?: string }, offset: number, size: number) {
  const text = (query.text ?? "").toLowerCase();
  const matches = box(account).messages
    .filter((m) => m.mailbox === folder)
    .filter((m) => (!query.unread || !m.seen) && (!query.flagged || m.flagged))
    .filter((m) => !text || [m.subject, m.text, m.from[0]?.name, m.from[0]?.address].some((v) => v?.toLowerCase().includes(text)))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const page = matches.slice(offset, offset + size);
  const counts = new Map<string, number>(), key = (m: DemoMessage) => conversationKey(m.subject, partyOf(m, account.email));
  for (const m of page) counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
  return {
    total: matches.length,
    items: page.map((m) => ({
      uid: m.uid, mailbox: m.mailbox, from: m.from[0] ?? { name: "", address: "" }, to: m.to, subject: m.subject, date: m.date,
      seen: m.seen, flagged: m.flagged, answered: m.answered, hasAttachments: m.attachments.length > 0, messageId: m.messageId,
      snippet: m.text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").slice(0, 160),
      thread: counts.get(key(m)) ?? 1,
    })),
  };
}

export function demoThread(account: MailAccount, folder: string, uid: number, subject: string) {
  const b = box(account);
  const opened = b.messages.find((m) => m.mailbox === folder && m.uid === uid);
  if (!opened) throw new MailError("That message is no longer there.");
  opened.seen = true;
  const key = normaliseSubject(subject);
  return sameConversation(opened, b.messages.filter((m) => m === opened || ((m.mailbox === folder || m.mailbox === "Sent") && normaliseSubject(m.subject) === key)), account.email)
    .sort((a, b2) => (a.date ?? "").localeCompare(b2.date ?? ""))
    .map((m): ParsedMessage & { mailbox: string; seen: boolean; flagged: boolean } => {
      const message = { ...m };
      // Attachment bytes stay on the server and are downloaded through the protected route.
      delete message.files;
      return message;
    });
}

export function demoAct(account: MailAccount, folder: string, uids: number[], action: string) {
  const targets = box(account).messages.filter((m) => m.mailbox === folder && uids.includes(m.uid));
  const move: Record<string, string> = { archive: "Archive", trash: "Trash", spam: "Spam", inbox: "INBOX" };
  for (const m of targets) {
    if (action === "read") m.seen = true;
    else if (action === "unread") m.seen = false;
    else if (action === "star") m.flagged = true;
    else if (action === "unstar") m.flagged = false;
    else if (move[action]) m.mailbox = move[action];
  }
}
export function demoMove(account: MailAccount, source: string, uids: number[], kind: MoveKind) {
  const b = box(account), target = { archive: "Archive", trash: "Trash", spam: "Spam", inbox: "INBOX" }[kind];
  const rows = b.messages.filter((m) => m.mailbox === source && uids.includes(m.uid));
  if (!rows.length) throw new MailError("Those messages are no longer there.");
  const messages = rows.map((m) => { const oldUid = m.uid; m.mailbox = target; m.uid = b.nextUid++; return { oldUid, uid: m.uid, messageId: m.messageId }; });
  return { target, validity: "1", messages };
}
export function demoRestore(account: MailAccount, receipt: MoveReceipt) {
  const b = box(account);
  const rows = receipt.messages.map((r) => b.messages.find((m) => m.mailbox === receipt.target && m.messageId === r.messageId && m.uid === r.uid));
  if (rows.some((m) => !m)) throw new MailError("Undo failed. The message moved again.");
  for (const m of rows) { m!.mailbox = receipt.source; m!.uid = b.nextUid++; }
}

export function demoSend(account: MailAccount, message: { to: string[]; cc: string[]; subject: string; html: string; text: string; inReplyTo?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }, answers: { mailbox: string; uid: number } | null) {
  const b = box(account);
  b.messages.push({
    uid: b.nextUid++, mailbox: "Sent", messageId: `<demo-${b.nextUid}@kwetuconnectads.co.ke>`, inReplyTo: message.inReplyTo ?? null, references: [],
    subject: message.subject, from: [{ name: "", address: account.email }], to: message.to.map((address) => ({ name: "", address })),
    cc: message.cc.map((address) => ({ name: "", address })), date: new Date().toISOString(), html: message.html, text: message.text,
    attachments: (message.attachments ?? []).map((a, index) => ({ index, filename: a.filename, size: a.content.length, contentType: a.contentType, inline: false })), files: message.attachments, seen: true, flagged: false, answered: false,
  });
  if (answers) { const m = b.messages.find((x) => x.mailbox === answers.mailbox && x.uid === answers.uid); if (m) m.answered = true; }
}

export function demoAttachment(account: MailAccount, folder: string, uid: number, index: number) {
  const message = box(account).messages.find((m) => m.mailbox === folder && m.uid === uid);
  const file = message?.attachments.find((a) => a.index === index);
  if(file?.filename==="sample-advert.png") return {filename:file.filename,contentType:"image/png",content:Buffer.from(SAMPLE_ADVERT_PNG,"base64")};
  if (message?.files?.[index]) return message.files[index];
  return file ? { filename: file.filename, contentType: "text/plain", content: Buffer.from("Sample campaign brief for an Eldoret bakery on the Kisumu Ndogo Road screen. No live booking.\n") } : null;
}

const SAMPLE_ADVERT_PNG = "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";
