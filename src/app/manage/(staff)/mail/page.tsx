import { requireStaff } from "@/lib/auth/server";
import { listAccounts, type AccountView } from "@/lib/mail/accounts";
import { encryptionConfigured } from "@/lib/mail/crypto";
import { mailDemoEnabled } from "@/lib/mail/demo";
import MailDesk from "@/components/manage/mail/MailDesk";

// Mail is read live from the mailbox's own server; a slow server gets up to a minute per step.
export const maxDuration = 60;

export default async function MailPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const staff = await requireStaff();
  const q = (await searchParams).q;
  const demo = mailDemoEnabled();
  if (!demo && !encryptionConfigured()) return <section className="mg-mail-setup"><div className="mg-panel mg-mail-connect" role="status">
    <span className="mg-eyebrow">Set up mail</span>
    <h1 className="mg-heading">Mail is not switched on yet</h1>
    <p className="mg-mail-muted">The server needs MAIL_ENCRYPTION_KEY before mailbox passwords can be stored. Ask whoever manages the website to add it.</p>
  </div></section>;
  let accounts: AccountView[] = [];
  let failed = false;
  try { accounts = await listAccounts(staff.email); } catch { failed = true; }
  if (failed) return <section className="mg-mail-setup"><div className="mg-panel mg-mail-connect" role="alert">
    <span className="mg-eyebrow">Mail</span>
    <h1 className="mg-heading">Your mailboxes could not be loaded</h1>
    <p className="mg-mail-muted">Reload the page to try again.</p>
  </div></section>;
  return <MailDesk demo={demo} initialAccounts={accounts} initialQuery={(Array.isArray(q) ? q[0] : q)?.slice(0, 200) ?? ""} />;
}
