"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const LINKS = [
  { href: "/manage", label: "Overview" },
  { href: "/manage/bookings", label: "Bookings" },
  { href: "/manage/adverts", label: "Adverts" },
  { href: "/manage/schedule", label: "Schedule" },
  { href: "/manage/settings", label: "Settings" },
];

/** The pill navigation in the top bar. The active pill fades in under its link; on a phone the row scrolls sideways. */
export default function ManagerNav({ adverts, bookings }: { adverts: number; bookings: number }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const current = (href: string) => href === "/manage" ? pathname === href : pathname.startsWith(href);
  // Keep the current page's pill in view when the row is scrolled on a narrow screen.
  useEffect(() => {
    const box = nav.current;
    const link = box?.querySelector<HTMLElement>("[aria-current=page]");
    if (!box || !link || box.scrollWidth <= box.clientWidth) return;
    const left = link.offsetLeft - (box.clientWidth - link.offsetWidth) / 2;
    box.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [pathname]);
  return <nav ref={nav} className="mg-nav" aria-label="Manager"><div className="mg-nav-track">
    {LINKS.map(({ href, label }) => <Link key={href} href={href} className="mg-nav-link" aria-current={current(href) ? "page" : undefined} aria-label={label + (label === "Adverts" && adverts ? ", " + adverts + " to check" : label === "Bookings" ? ", " + bookings : "")}>
      <span aria-hidden="true">{label}</span>
      {label === "Adverts" && adverts > 0 && <span className="mg-badge" data-tone="alert" aria-hidden="true">{adverts}</span>}
      {label === "Bookings" && <span className="mg-badge" aria-hidden="true">{bookings}</span>}
    </Link>)}
  </div></nav>;
}
