"use client";
import Link from "next/link";
import ManagerNav from "./ManagerNav";
import { useSidebar } from "./useSidebar";

export default function ManagerSidebar({ adverts, email, signOut }: { adverts: number; email: string; signOut: () => Promise<void> }) {
  const { open, toggle } = useSidebar();
  // On a phone the open sidebar covers the page, so picking a page closes it.
  const closeOnPhone = () => { if (open && window.matchMedia("(max-width: 767px)").matches) toggle(); };
  const name = email.split("@")[0];
  return <aside id="manager-sidebar" className="manager-rail" data-open={open}>
    <div className="rail-top"><Link href="/manage" className="rail-logo" aria-label="KCA manager">K</Link><span className="rail-text"><b>KCA Manager</b><small>Kisumu Ndogo Rd screen</small></span></div>
    <ManagerNav adverts={adverts} expanded={open} onNavigate={closeOnPhone} />
    <div className="rail-account">
      <span className="rail-avatar" title={email}>{name.slice(0, 2).toUpperCase()}</span>
      <span className="rail-text"><b>{name}</b><small>{email}</small></span>
      <form action={signOut}><button aria-label="Sign out" title="Sign out">Exit</button></form>
    </div>
  </aside>;
}
