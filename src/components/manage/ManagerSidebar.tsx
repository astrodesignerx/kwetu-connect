"use client";
import Link from "next/link";
import ManagerNav from "./ManagerNav";
import { useSidebar } from "./useSidebar";
import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

export default function ManagerSidebar({ adverts, email, signOut, children }: { adverts: number; email: string; signOut: () => Promise<void>; children?: ReactNode }) {
  const { open, toggle } = useSidebar();
  const close = () => { toggle(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus()); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && open && window.matchMedia("(max-width: 767px)").matches) { toggle(); document.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, toggle]);
  // On a phone the open sidebar covers the page, so picking a page closes it.
  const closeOnPhone = () => { if (open && window.matchMedia("(max-width: 767px)").matches) toggle(); };
  const name = email.split("@")[0];
  return <><button type="button" className="rail-dismiss" data-open={open} aria-label="Close navigation" onClick={close} tabIndex={-1} /><aside id="manager-sidebar" className="manager-rail" data-open={open}>
    <div className="rail-top"><Link href="/manage" className="rail-logo" aria-label="KCA manager">K</Link><span className="rail-text"><b>KCA Manager</b><small>Kisumu Ndogo Rd screen</small></span><button type="button" className="rail-close" aria-label="Close sidebar" onClick={close}><X size={17} aria-hidden="true" /></button></div>
    <p className="rail-section-label">Workspace</p><ManagerNav adverts={adverts} expanded={open} onNavigate={closeOnPhone} />
    <div className="rail-onair">{children}</div>
    <div className="rail-account">
      <span className="rail-avatar" title={email}>{name.slice(0, 2).toUpperCase()}</span>
      <span className="rail-text"><b>{name}</b><small>{email}</small></span>
      <form action={signOut}><button aria-label="Sign out" title="Sign out">Exit</button></form>
    </div>
  </aside></>;
}
