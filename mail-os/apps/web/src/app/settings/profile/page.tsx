"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { passwordStrength } from "@/lib/signal-settings";
import { Meter } from "@/components/signal";
import { Button, Input } from "@/components/ui";
import { Avatar, Feedback, Field, Panel, SettingsHeader } from "@/components/settings/settings";
import s from "./page.module.css";

export default function ProfilePage() {
  const { user, setUser, setAuth } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<"details" | "password" | null>(null);
  const [result, setResult] = useState<{ form: string; error?: string; message?: string } | null>(null);
  const strength = passwordStrength(newPassword);

  async function save(event: React.FormEvent, form: "details" | "password") {
    event.preventDefault();
    setBusy(form); setResult(null);
    try {
      const response = await api.updateMe(form === "password" ? { currentPassword, newPassword } : {
        displayName: displayName !== user?.displayName ? displayName : undefined,
        username: username !== user?.username ? username : undefined,
      });
      if (response.token) setAuth(response.token, response.user);
      else setUser(response.user);
      if (form === "details") { setUsername(response.user.username); setDisplayName(response.user.displayName); }
      else { setCurrentPassword(""); setNewPassword(""); }
      setResult({ form, message: response.token ? "Password changed. Other signed-in sessions have been signed out." : "Details saved." });
    } catch (error) { setResult({ form, error: error instanceof Error ? error.message : "Update failed." }); }
    finally { setBusy(null); }
  }

  return <div className={s.page}>
    <SettingsHeader title="Profile" context="Settings / Personal" description="How you appear to your team and how you sign in." />
    <div className={s.layout}>
      <aside className={s.pass}><small>Kwetu OS / Staff</small><Avatar name={user?.displayName ?? ""} /><div><h2>{user?.displayName}</h2><p>{user?.role}</p></div><dl><dt>Username</dt><dd>@{user?.username}</dd><dt>Email</dt><dd>{user?.email}</dd><dt>Member since</dt><dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "Not available"}</dd></dl></aside>
      <div className={s.forms}>
        <Panel><form className={s.form} onSubmit={(event) => void save(event, "details")}><h2>Details</h2><div className={s.fields}>
          <Field label="Display name" htmlFor="displayName"><Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></Field>
          <Field label="Username" htmlFor="username" hint="Use this or your email to sign in."><Input id="username" autoComplete="username" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} required /></Field>
        </div>{result?.form === "details" && <Feedback error={result.error} message={result.message} />}<Button type="submit" disabled={!!busy}>Save details</Button></form></Panel>
        <Panel><form className={s.form} onSubmit={(event) => void save(event, "password")}><h2>Password</h2><div className={s.fields}>
          <Field label="Current password" htmlFor="currentPassword"><Input id="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
          <Field label="New password" htmlFor="newPassword"><Input id="newPassword" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-describedby="password-rules" /><Meter value={strength.score} label="New password strength" /></Field>
        </div><ul id="password-rules" className={s.rules}>{strength.rules.map((rule) => <li key={rule.key} data-met={rule.met}><span aria-hidden="true">{rule.met ? "✓" : "○"}</span> {rule.label}<span className={s.srOnly}>: {rule.met ? "met" : "not met"}</span></li>)}</ul><p className={s.note}>At least 8 characters are required. The other rules are guidance. Changing your password signs you out everywhere else.</p>
          {result?.form === "password" && <Feedback error={result.error} message={result.message} />}<Button type="submit" disabled={!!busy}>{busy === "password" ? "Changing password..." : "Change password"}</Button>
        </form></Panel>
      </div>
    </div>
  </div>;
}
