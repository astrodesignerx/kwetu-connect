"use client";

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
      welcome
      title="Welcome back."
      subtitle="Sign in to Kwetu OS"
      footer={
        <>
          <Link
            href="/register"
            className="auth-link"
          >
            I have an invitation
          </Link>
        </>
      }
    >
      <form
        onSubmit={onSubmit}
        style={{ "--i": 1 } as React.CSSProperties}
        className="flex flex-col gap-4"
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

        <AuthSubmit busy={busy} busyLabel="Signing in…">
          Sign in
          <ArrowRight aria-hidden size={15} />
        </AuthSubmit>

        {/* Honest about the actual recovery path: there is no self-service reset,
            because there is no outbound mail for it. An admin runs the CLI. */}
        <p className="text-center text-[11px] text-brand-black/60 dark:text-brand-cream/55">
          Forgotten your password? An admin can reset it for you.
        </p>
      </form>
    </AuthCard>
  );
}
