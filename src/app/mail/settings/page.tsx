import { requireStaff } from "@/lib/auth/server";
import { listAccounts, type AccountView } from "@/lib/mail/accounts";
import { mailDemoEnabled } from "@/lib/mail/demo";
import { seedDemoMailboxes } from "@/lib/mail/demo-sharing";
import MailDesk from "@/components/mail/MailDesk";
export default async function SettingsPage() {
  const staff = await requireStaff("/mail"), demo = mailDemoEnabled();
  if (demo) await seedDemoMailboxes(staff.email);
  let accounts: AccountView[] | null = null;
  try { accounts = await listAccounts(staff.email); } catch {}
  if (!accounts) return <section className="panel mail-unavailable" role="alert"><h1>Could not load your mailboxes</h1><p>Reload the page to try again.</p></section>;
  return <MailDesk me={staff.email} initialView="Mailboxes" initialAccounts={accounts} initialQuery="" demo={demo}/>;
}
