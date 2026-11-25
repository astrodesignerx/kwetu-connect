import { requireStaff } from "@/lib/auth/server";
import { listAccounts, type AccountView } from "@/lib/mail/accounts";
import { encryptionConfigured } from "@/lib/mail/crypto";
import { mailDemoEnabled } from "@/lib/mail/demo";
import { seedDemoMailboxes } from "@/lib/mail/demo-sharing";
import MailDesk from "@/components/mail/MailDesk";

// Mail is read live from the mailbox's own server; a slow server gets up to a minute per step.
export const maxDuration = 60;

export default async function MailPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const staff = await requireStaff("/mail");
  const q = (await searchParams).q;
  const demo = mailDemoEnabled();
  if (!demo && !encryptionConfigured()) return <section className="panel mail-unavailable" role="status">
    <h1>Mail setup is incomplete</h1>
    <p>Ask your site administrator to configure mailbox password encryption.</p>
  </section>;
  let accounts: AccountView[] = [];
  let failed = false;
  try { if (demo) await seedDemoMailboxes(staff.email); accounts = await listAccounts(staff.email); } catch { failed = true; }
  if (failed) return <section className="panel mail-unavailable" role="alert">
    <h1>Could not load your mailboxes</h1>
    <p>Reload the page to try again.</p>
  </section>;
  return <MailDesk me={staff.email} demo={demo} initialAccounts={accounts} initialQuery={(Array.isArray(q) ? q[0] : q)?.slice(0, 200) ?? ""} />;
}
