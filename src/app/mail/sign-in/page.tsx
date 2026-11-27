import { redirect } from "next/navigation";
import { signedInStaff } from "@/lib/auth/server";
import { isMemoryMode } from "@/lib/store";
import MailGate from "@/components/mail/MailGate";
import MailSignIn from "@/components/mail/MailSignIn";

export const metadata = { title: "Sign in to staff mail", robots: { index: false, follow: false } };

/** Staff mail's own sign-in page. It uses the same staff accounts and sign-in actions as the manager. */
export default async function MailSignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await signedInStaff()) redirect("/mail");
  const { error } = await searchParams;
  return <MailGate title="Every booking conversation in one place." text="Mail, clients and bookings side by side, so a quote never waits."
    points={[["inbox", "Shared team mailboxes"], ["calendar", "The booking next to every email"], ["bolt", "A clear next step for each client"]]}>
    <MailSignIn demo={isMemoryMode()} linkError={error === "link"} />
  </MailGate>;
}
