"use client";

import s from "@/components/auth-card.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AtSign, KeyRound, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { configureAuthPersistence } from "@/components/shell/auth-persistence";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthPasswordField,
  AuthSubmit,
} from "@/components/auth-card";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [step, setStep] = useState<"login" | "request">("login");
  const [sent, setSent] = useState(false);
  const [requestIdentifier, setRequestIdentifier] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function askForReset(event: React.FormEvent) {
    event.preventDefault(); setRequestBusy(true); setRequestError(null);
    try { await api.requestPasswordReset(requestIdentifier); setSent(true); }
    catch { setRequestError("The request could not be sent. Please try again."); }
    finally { setRequestBusy(false); }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({ identifier, password });
      configureAuthPersistence(remember, true);
      beginSession(queryClient, res.token, res.user);
      router.replace("/mail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={step === "login" ? "Sign in" : "Ask for a new password"}
      subtitle={step === "login" ? "Use your Kwetu OS account" : "An admin will help you sign in again"}

    >
      <div className={s.steps}>
      <form data-active={step === "login"} aria-hidden={step !== "login"} inert={step !== "login"}
        onSubmit={onSubmit}
        style={{ "--i": 1 } as React.CSSProperties}
        className={`${s.step} flex flex-col gap-4`}
      >
        <AuthField
          id="identifier"
          label="Email or username"
          icon={AtSign}
          // Not type="email": a display name is equally valid, and the browser
          // would block submission of one as a malformed address.
          type="text"
          required
          autoFocus
          autoComplete="username"
          placeholder="@username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <AuthPasswordField
          id="password"
          label="Password"
          icon={KeyRound}
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <AuthError>{error}</AuthError>

        <button type="button" role="switch" aria-checked={remember} className="signal-remember"
          onClick={() => setRemember((value) => !value)}>
          <span className="signal-switch" data-on={remember}><span /></span>Keep me signed in
        </button>

        <AuthSubmit busy={busy} busyLabel="Signing in">
          Sign in
          <ArrowRight aria-hidden size={16} />
        </AuthSubmit>

        <div className={s.links}><button type="button" className="auth-link" onClick={() => { setRequestIdentifier(identifier); setStep("request"); }}>Forgot your password?</button><Link href="/register" className="auth-link">I have an invitation</Link></div>
      </form>
      <div className={`${s.step} flex flex-col gap-4`} data-active={step === "request"} aria-hidden={step !== "request"} inert={step !== "request"}>
        {sent ? <p role="status">If that account exists, your admins have been asked. They will give you a new password.</p> : <form className="flex flex-col gap-4" onSubmit={askForReset}>
          <AuthField id="reset-identifier" label="Email or username" icon={AtSign} type="text" autoComplete="username" required value={requestIdentifier} onChange={event => setRequestIdentifier(event.target.value)} />
          <AuthError>{requestError}</AuthError>
          <AuthSubmit busy={requestBusy} busyLabel="Asking an admin">Ask an admin to reset it</AuthSubmit>
        </form>}
        <div className={s.links}><button type="button" className="auth-link" onClick={() => { setStep("login"); setSent(false); }}>Back to sign in</button></div>
      </div>
      </div>
    </AuthCard>
  );
}
