"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ManagerNav() {
  const pathname = usePathname();
  return <nav className="segmented manager-nav" aria-label="Manager">{[
    ["/manage", "Week"], ["/manage/bookings", "Bookings"], ["/manage/schedule", "Schedule"], ["/manage/settings", "Settings"],
  ].map(([href, label]) => <Link href={href} key={href} aria-current={(href === "/manage" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined}>{label}</Link>)}</nav>;
}
