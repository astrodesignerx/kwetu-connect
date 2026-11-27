"use client";
import { useActionState, useState } from "react";
import { signIn, signInWithPassword } from "@/app/manage/auth-actions";
import MailIcon from "./MailIcon";

type Mode = "password" | "link" | "reset";
const TITLES: Record<Mode, [string, string]> = {
  password: ["Sign in", "For Kwetu Connect staff. Use your staff email and password."],
  link: ["Email me a sign-in link", "We will email a one-time link that signs you in."],
  reset: ["Set or reset your password", "We will email a one-time link to sign you in and choose a new password."],
};

/** Staff mail sign-in: the same password, email link and reset flows as the manager, returning to /mail. */
export default function MailSignIn({ demo, linkError }: { demo: boolean; linkError: boolean }) {
  const [mode, setMode] = useState<Mode>("password"), [shownFor, setShownFor] = useState<Mode | null>(null);
  const [email, setEmail] = useState(""), [showPassword, setShowPassword] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, { message: "" });
  const [linkState, linkAction, linkPending] = useActionState(signIn, { message: "" });
  const pending = mode === "password" ? pwPending : linkPending;
  const status = shownFor === mode ? (mode === "password" ? pwState.message : linkState.message) : "";
  const sent = mode !== "password" && /on its way/.test(status);
  const [title, text] = TITLES[mode];
  const switchMode = (next: Mode) => { setMode(next); setShownFor(null); };
  return <div className="mail-sign-in" key={mode}>
    <h2>{title}</h2>
    <p className="gate-lede">{demo ? "Demo mode: any email and password opens the sample mailbox. Nothing is sent." : text}</p>
    {linkError && <p className="gate-alert" role="alert"><MailIcon name="x" size="xs" />That sign-in link has expired or could not be checked. Sign in with your password or ask for a new link.</p>}
    <form action={mode === "password" ? pwAction : linkAction} onSubmit={() => setShownFor(mode)}>
      <fieldset disabled={pending}>
        <input type="hidden" name="next" value="/mail" />
        {mode !== "password" && <input type="hidden" name="mode" value={mode} />}
        <label className="gate-field">Staff email
          <input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@kwetuconnectads.co.ke" required maxLength={254} autoFocus />
        </label>
        {mode === "password" && <label className="gate-field">Password
          <span className="gate-password">
            <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" required maxLength={500} />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}><MailIcon name={showPassword ? "eyeslash" : "eye"} size="sm" /></button>
          </span>
        </label>}
        <button type="submit" className="gate-go" aria-busy={pending}>
          {pending ? <><i className="gate-spin" aria-hidden="true" />{mode === "password" ? "Signing in" : "Sending"}</> : mode === "password" ? <>Sign in<MailIcon name="arrowRight" size="sm" /></> : mode === "link" ? "Send sign-in link" : "Email password setup link"}
        </button>
      </fieldset>
      {status && <p key={status} className={sent ? "gate-note" : "gate-alert shake"} role={sent ? "status" : "alert"}>{sent ? <MailIcon name="check" size="xs" /> : <MailIcon name="x" size="xs" />}{status}</p>}
    </form>
    <div className="gate-links">{mode === "password"
      ? <><button type="button" onClick={() => switchMode("reset")}>Set or reset password</button><button type="button" onClick={() => switchMode("link")}>Email me a sign-in link</button></>
      : <button type="button" onClick={() => switchMode("password")}><MailIcon name="left" size="xs" />Back to password sign-in</button>}</div>
  </div>;
}
