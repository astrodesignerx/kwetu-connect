"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { usePathname, useSearchParams } from "next/navigation";
import ThemeSwitch from "@/components/workspace/ThemeSwitch";
import { Input } from "@/components/ui/input";
import ManagerNav from "./ManagerNav";
import { mailUnreadCount } from "@/app/mail/actions";
import ProfileMenu from "./ProfileMenu";

/** The manager's top bar: logo, pill navigation, search, theme, notices, new quote and the profile pill. */
export default function ManagerTopbar({ adverts, bookings, email, signOut }: { adverts: number; bookings: number; email: string; signOut: () => Promise<void> }) {
  const [mailUnread, setMailUnread] = useState<number | null>(null);
  useEffect(() => { let live = true; void mailUnreadCount().then((r) => { if (live && r.ok) setMailUnread(r.data); }).catch(() => undefined); return () => { live = false; }; }, []);
  const search = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.current?.focus(); } };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  // One search for the page: Adverts searches its queue, everything else searches bookings. Active filters are kept.
  const onAdverts = pathname === "/manage/adverts";
  const keep = onAdverts ? ["filter"] : pathname === "/manage/bookings" ? ["status", "from", "to", "view", "hide", "layout"] : [];
  return <header className="mg-topbar">
    <Link href="/manage" className="mg-brand" aria-label="Kwetu Connect manager home"><Image src="/logo-icon.svg" width={27} height={27} alt="" priority /></Link>
    <ManagerNav adverts={adverts} bookings={bookings} />
    <form action={onAdverts ? "/manage/adverts" : "/manage/bookings"} className="mg-search" role="search">
      {keep.map((name) => params.get(name) && <input type="hidden" key={name} name={name} value={params.get(name) ?? ""} />)}
      <label><MagnifyingGlass size={15} aria-hidden="true" /><Input ref={search} key={params.get("q")} name="q" aria-label={onAdverts ? "Search adverts by reference, business or M-Pesa code" : "Search bookings by reference, business or M-Pesa code"} placeholder={onAdverts ? "Search adverts, references, M-Pesa codes" : "Search bookings, references, M-Pesa codes"} maxLength={150} defaultValue={params.get("q") ?? ""} /></label>
      <kbd>Ctrl K</kbd><button type="submit" className="sr-only focus:not-sr-only">Search</button>
    </form>
    <Link href="/mail" className="mg-pill" aria-label={mailUnread === null ? "Mail" : `Mail, ${mailUnread} unread`}>Mail{mailUnread !== null ? ` (${mailUnread})` : ""}</Link>
    <span className="mg-theme"><ThemeSwitch variant="toggle" /></span>
    <Link href="/manage/adverts" className="mg-icon-button" aria-label={adverts ? `${adverts} adverts waiting for review` : "No adverts waiting for review"}><Bell size={16} aria-hidden="true" />{adverts > 0 && <i aria-hidden="true" />}</Link>
    <Link href="/book" className="mg-pill mg-new-quote"><Plus size={13} weight="bold" aria-hidden="true" />New quote</Link>
    <ProfileMenu email={email} signOut={signOut} />
  </header>;
}
