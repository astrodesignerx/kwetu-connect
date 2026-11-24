import type { MessageRow } from "@/app/mail/actions";
import type { ThreadMeta } from "./kca-data";
import { emailKey } from "./kca";

export const messageIdentity = (row: { messageId: string | null; mailbox: string; uid: number }) => row.messageId || `uid:${row.mailbox}:${row.uid}`;
export function isWaiting(row: MessageRow, mailboxEmail: string, meta?: ThreadMeta) {
  return !row.answered && emailKey(row.from.address) !== emailKey(mailboxEmail)
    && !/^(no-?reply|mailer-daemon|notifications?|alerts?|postmaster)@/i.test(row.from.address)
    && meta?.done_message_id !== messageIdentity(row);
}
