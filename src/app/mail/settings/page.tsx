import { requireStaff } from "@/lib/auth/server";
import { listAccounts, type AccountView } from "@/lib/mail/accounts";
import { mailDemoEnabled } from "@/lib/mail/demo";
import MailSettings from "@/components/mail/MailSettings";

export default async function SettingsPage() {
  const staff = await requireStaff("/mail");
  let accounts: AccountView[];
  try { accounts = await listAccounts(staff.email); }
  catch { return <section className="mail-settings" role="alert"><h1>Mail settings</h1><p>Your mailboxes could not be loaded. Reload to try again.</p></section>; }
  return <MailSettings accounts={accounts} demo={mailDemoEnabled()} />;
}
