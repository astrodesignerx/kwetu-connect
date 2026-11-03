import { signIn } from "../auth-actions";
import { isMemoryMode } from "@/lib/store";
import { ActionForm } from "@/components/manage/ActionForm";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const demo = isMemoryMode();
  const { error } = await searchParams;
  return <section className="staff-card mx-auto max-w-md space-y-6">
    <h1 className="text-2xl font-bold">{demo ? "Demo sign-in" : "KCA staff sign-in"}</h1>
    <p>{demo ? "Try the manager area. Demo bookings disappear when the server restarts." : "Use your KCA staff email. We will send you a sign-in link."}</p>
    {error && <p role="alert">This sign-in link has expired or could not be verified. Request a new link.</p>}
    <ActionForm action={signIn} submit={demo ? "Demo sign-in" : "Send sign-in link"}>{!demo && <label>Staff email<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>}</ActionForm>
  </section>;
}
