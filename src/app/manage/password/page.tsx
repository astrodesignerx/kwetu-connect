import { requireStaff } from "@/lib/auth/server";
import { safeSignInNext } from "@/lib/auth/next";
import { isMemoryMode } from "@/lib/store";
import PasswordSetupForm from "@/components/manage/PasswordSetupForm";

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const staff = await requireStaff();
  const { next } = await searchParams;
  const dest = safeSignInNext(next);
  return (
    <section className="staff-card mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Set your password</h1>
      <p>
        Signed in as {staff.email}. Choose a password of at least 12 characters so you can sign in to KCA manager and
        Mail without email links.
      </p>
      <PasswordSetupForm next={dest} demo={isMemoryMode()} />
    </section>
  );
}
