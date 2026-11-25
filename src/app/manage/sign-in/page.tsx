import { signIn } from "../auth-actions";
import { isMemoryMode } from "@/lib/store";
import { safeSignInNext } from "@/lib/auth/next";
import { ActionForm } from "@/components/manage/ActionForm";
import StaffSignInForm from "@/components/manage/StaffSignInForm";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const demo = isMemoryMode();
  const { error, next } = await searchParams;
  const dest = safeSignInNext(next);
  return (
    <section className="staff-card mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{demo ? "Demo sign-in" : "KCA staff sign-in"}</h1>
      {demo ? (
        <>
          <p>Try the manager area. Demo bookings disappear when the server restarts.</p>
          <ActionForm action={signIn} submit="Demo sign-in">
            <input type="hidden" name="next" value={dest} />
          </ActionForm>
        </>
      ) : (
        <StaffSignInForm next={dest} linkError={Boolean(error)} />
      )}
    </section>
  );
}
