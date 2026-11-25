"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LockSimple, SignOut } from "@phosphor-icons/react";

/** The profile pill: the signed-in staff member, with their email and sign out in a small menu. */
export default function ProfileMenu({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const name = email.split("@")[0];
  return <div className="mg-profile" ref={root} data-open={open}>
    <button ref={button} type="button" className="mg-profile-button" aria-expanded={open} aria-controls="mg-profile-menu" aria-label={"Account, " + email} onClick={() => setOpen(!open)}>
      <span className="mg-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
      <span className="mg-profile-text" aria-hidden="true"><b>{name}</b><small>Staff</small></span>
    </button>
    <div id="mg-profile-menu" className="mg-profile-menu">
      <p><small>Signed in as</small><b>{email}</b></p>
      <Link href="/manage/password" className="mg-menu-item" onClick={() => setOpen(false)}><LockSimple size={15} aria-hidden="true" />Password</Link>
      <form action={signOut}><button type="submit" className="mg-menu-item"><SignOut size={15} aria-hidden="true" />Sign out</button></form>
    </div>
  </div>;
}
