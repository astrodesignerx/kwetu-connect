"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, AtSign, KeyRound, Ticket, User } from "lucide-react";
import { api } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthPasswordField,
  AuthSubmit,
} from "@/components/auth-card";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Prefilled from the ?invite= in the link an admin sends.
  const [inviteToken, setInviteToken] = useState(searchParams.get("invite") ?? "");
  const [mode, setMode] = useState<"bootstrap" | "invite" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only the very first account can be created without an invitation; ask the server
  // which case this is so the form doesn't demand a code that isn't needed yet.
  useEffect(() => {
    let cancelled = false;
    void api
      .registrationMode()
      .then((r) => !cancelled && setMode(r.mode))
      .catch(() => !cancelled && setMode("invite"));
    return () => {
      cancelled = true;
    };
  }, []);

  const needsInvite = mode !== "bootstrap";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.register({
        email,
        password,
        displayName,
        inviteToken: needsInvite ? inviteToken.trim() : undefined,
      });
      beginSession(queryClient, res.token, res.user);
      router.replace("/mail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={mode === "bootstrap" ? "Set up your workspace" : "Create your account"}
      subtitle={
        mode === "bootstrap"
          ? "This first account becomes the administrator"
          : "Use the invitation an admin sent you"
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="auth-link"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={onSubmit}
        style={{ "--i": 1 } as React.CSSProperties}
        className="flex flex-col gap-4"
      >
        {needsInvite && (
          <AuthField
            id="invite"
            label="Invitation code"
            icon={Ticket}
            required
            value={inviteToken}
            onChange={(e) => setInviteToken(e.target.value)}
            placeholder="Paste the code from your invite link"
            className="!pr-3 font-mono !text-xs"
          />
        )}

        <AuthField
          id="displayName"
          label="Display name"
          icon={User}
          required
          minLength={2}
          autoComplete="name"
          placeholder="Jane Wanjiru"
          hint="How your name appears to teammates. Your @username is derived from it."
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <AuthField
          id="email"
          label="Email"
          icon={AtSign}
          type="email"
          required
          autoComplete="email"
          placeholder="you@kwetuconnectads.co.ke"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthPasswordField
          id="password"
          label="Password"
          icon={KeyRound}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <AuthError>{error}</AuthError>

        <AuthSubmit busy={busy} busyLabel="Creating account…">
          {mode === "bootstrap" ? "Create admin account" : "Create account"}
          <ArrowRight aria-hidden size={15} />
        </AuthSubmit>
      </form>
    </AuthCard>
  );
}
