"use client";
import { useActionState, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { signIn, signInWithPassword } from "@/app/manage/auth-actions";
import type { SignInNext } from "@/lib/auth/next";

type Mode = "password" | "link" | "reset";

const SUBTITLES: Record<Mode, string> = {
  password: "Sign in with your KCA staff email and password.",
  link: "Use your KCA staff email. We will email a one-time sign-in link.",
  reset: "Enter your KCA staff email. We will email a one-time link to sign you in and set a new password.",
};

/** Interactive staff sign-in form: email and password primary, with one-time link and password setup modes. */
export default function StaffSignInForm({ next, linkError }: { next: SignInNext; linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("password");
  const [shownForMode, setShownForMode] = useState<Mode | null>("password");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, { message: "" });
  const [linkState, linkAction, linkPending] = useActionState(signIn, { message: "" });

  const pending = mode === "password" ? pwPending : linkPending;
  const rawMessage = mode === "password" ? pwState.message : linkState.message;
  const status = shownForMode === mode ? rawMessage : "";

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setShownForMode(null);
  }

  return (
    <div className="space-y-4">
      <p>{SUBTITLES[mode]}</p>
      {linkError && (
        <p className="staff-alert" role="alert">
          This sign-in link has expired or could not be verified. Sign in with your password or request a new link.
        </p>
      )}
      <form
        action={mode === "password" ? pwAction : linkAction}
        onSubmit={() => setShownForMode(mode)}
        className="staff-form space-y-4"
      >
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <input type="hidden" name="next" value={next} />
          {mode !== "password" && <input type="hidden" name="mode" value={mode} />}
          <label>
            Staff email
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          {mode === "password" && (
            <label>
              Password
              <div className="staff-password">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
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
          )}
          <button className="staff-button" type="submit">
            {pending
              ? mode === "password"
                ? "Signing in..."
                : "Sending link..."
              : mode === "password"
                ? "Sign in"
                : mode === "link"
                  ? "Send sign-in link"
                  : "Email password setup link"}
          </button>
        </fieldset>
        {status && (
          <p key={status} className="animate-quote-in text-sm motion-reduce:animate-none" role="status">
            {status}
          </p>
        )}
      </form>
      <div className="staff-auth-links">
        {mode === "password" ? (
          <>
            <button type="button" className="staff-text-link" onClick={() => switchMode("reset")}>
              Set or reset password
            </button>
            <button type="button" className="staff-text-link" onClick={() => switchMode("link")}>
              Email me a sign-in link
            </button>
          </>
        ) : (
          <button type="button" className="staff-text-link" onClick={() => switchMode("password")}>
            Back to password sign-in
          </button>
        )}
      </div>
    </div>
  );
}
