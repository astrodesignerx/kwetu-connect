import { createHmac, timingSafeEqual } from "node:crypto";
import type { ImapFlow } from "imapflow";
import { classify, MailError, pathOf, withImap, type MailAccount } from "./client";
import { demoMove, demoRestore, isDemoAccount } from "./demo";

export type MoveKind = "archive" | "trash" | "spam" | "inbox";
export type MoveReceipt = { accountId: string; source: string; target: string; expires: number; validity: string | null; messages: { oldUid: number; uid: number | null; messageId: string | null }[]; signature: string };
const payload = (r: Omit<MoveReceipt, "signature">) => JSON.stringify([r.accountId, r.source, r.target, r.expires, r.validity, r.messages]);
const sign = (a: MailAccount, r: Omit<MoveReceipt, "signature">) => createHmac("sha256", a.password_enc).update(payload(r)).digest("hex");
const unavailable = () => new MailError("Undo failed. The message moved again or the mail server is unreachable. Its current location has been left unchanged.");

export async function moveMessages(account: MailAccount, source: string, uids: number[], kind: MoveKind): Promise<MoveReceipt> {
  if (!source || source.length > 200 || /[\r\n]/.test(source) || !uids.length || uids.length > 200 || uids.some((uid) => !Number.isInteger(uid) || uid < 1)) throw new MailError("Choose messages and a folder.");
  const moved = isDemoAccount(account) ? demoMove(account, source, uids, kind) : await withImap(account, async (c) => {
    const target = pathOf(classify(await c.list()), kind);
    if (!target) throw new MailError(`This mailbox has no ${kind === "trash" ? "Bin" : kind} folder.`);
    const lock = await c.getMailboxLock(source);
    try {
      const messages: MoveReceipt["messages"] = [];
      for await (const m of c.fetch(uids.join(","), { uid: true, envelope: true }, { uid: true })) messages.push({ oldUid: m.uid, uid: null, messageId: m.envelope?.messageId ?? null });
      if (!messages.length) throw new MailError("Those messages are no longer there.");
      const result = await c.messageMove(messages.map((m) => m.oldUid).join(","), target, { uid: true });
      if (!result) throw new MailError("The messages could not be moved.");
      for (const m of messages) m.uid = result.uidMap?.get(m.oldUid) ?? null;
      return { target, validity: result.uidValidity?.toString() ?? null, messages };
    } finally { lock.release(); }
  });
  const receipt = { accountId: account.id, source, ...moved, expires: Date.now() + 60_000 };
  return { ...receipt, signature: sign(account, receipt) };
}

/** Resolve all messages before moving any. Never guess a destination UID. */
export async function restoreMoved(c: ImapFlow, receipt: MoveReceipt) {
  const lock = await c.getMailboxLock(receipt.target);
  try {
    const uids: number[] = [];
    for (const m of receipt.messages) {
      let uid: number | null = null;
      const validityMatches = receipt.validity && c.mailbox && typeof c.mailbox === "object" && c.mailbox.uidValidity.toString() === receipt.validity;
      if (m.uid && validityMatches) {
        const found = await c.fetchOne(m.uid, { uid: true, envelope: true }, { uid: true });
        if (found && (!m.messageId || found.envelope?.messageId === m.messageId)) uid = m.uid;
      }
      if (!uid && m.messageId) {
        const matches = await c.search({ header: { "message-id": m.messageId } }, { uid: true });
        if (matches && matches.length === 1) uid = matches[0];
      }
      if (!uid) throw unavailable();
      uids.push(uid);
    }
    if (!await c.messageMove(uids.join(","), receipt.source, { uid: true })) throw unavailable();
  } finally { lock.release(); }
}
export async function undoMove(account: MailAccount, receipt: MoveReceipt) {
  const expected = sign(account, receipt), supplied = typeof receipt.signature === "string" ? receipt.signature : "";
  if (receipt.accountId !== account.id || receipt.expires < Date.now() || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw unavailable();
  try {
    if (isDemoAccount(account)) demoRestore(account, receipt);
    else await withImap(account, (c) => restoreMoved(c, receipt));
  } catch { throw unavailable(); }
}
