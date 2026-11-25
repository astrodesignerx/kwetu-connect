"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { updateStaffPassword } from "@/app/manage/auth-actions";
import type { SignInNext } from "@/lib/auth/next";

/** Password setup and update form for a signed-in KCA staff member. */
export default function PasswordSetupForm({ next, demo }: { next: SignInNext; demo: boolean }) {
  const [state, formAction, pending] = useActionState(updateStaffPassword, { message: "" });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-4">
      <form action={formAction} className="staff-form space-y-4">
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label>
            New password
            <div className="staff-password">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={500}
              />
              <button
                type="button"
                className="staff-eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </label>
          <label>
            Confirm password
            <input
              type={showPassword ? "text" : "password"}
              name="confirm"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={500}
            />
          </label>
          <button className="staff-button" type="submit" disabled={demo}>
            {pending ? "Saving password..." : "Save password"}
          </button>
        </fieldset>
        {demo && <p className="text-xs text-(--muted-foreground)">Demo mode uses one-click sign-in and does not save passwords.</p>}
        {state.message && (
          <p key={state.message} className="animate-quote-in text-sm motion-reduce:animate-none" role="status">
            {state.message}
          </p>
        )}
      </form>
      <div className="staff-auth-links">
        <Link href={next} className="staff-text-link">
          {next === "/mail" ? "Back to Mail" : "Back to manager"}
        </Link>
      </div>
    </div>
  );
}
