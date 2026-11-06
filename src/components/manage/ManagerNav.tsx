"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquaresFour, ListBullets, CalendarBlank, VideoCamera, Gear } from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
export default function ManagerNav({ adverts, expanded, onNavigate }: { adverts: number; expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const links = [
    { href: "/manage", label: "Overview", icon: SquaresFour },
    { href: "/manage/bookings", label: "Bookings", icon: ListBullets },
    { href: "/manage/schedule", label: "Schedule", icon: CalendarBlank },
    { href: "/manage/adverts", label: "Adverts", icon: VideoCamera },
    { href: "/manage/settings", label: "Settings", icon: Gear },
  ];
  const current = (href: string) => href === "/manage" ? pathname === href
    : pathname.startsWith(href);
  return <nav className="manager-nav" aria-label="Manager">{links.map(({ href, label, icon: Icon }) => {
    const link = <Link key={label} href={href} aria-label={label + (label === "Adverts" && adverts ? ", " + adverts + " to check" : "")} aria-current={current(href) ? "page" : undefined} onClick={onNavigate}>
      <Icon size={21} aria-hidden="true" /><span className="nav-label" aria-hidden="true">{label}</span>
      {label === "Adverts" && adverts > 0 && <span className="rail-badge" aria-hidden="true">{adverts}</span>}
    </Link>;
    return expanded ? link : <Tooltip label={label} key={label}>{link}</Tooltip>;
  })}</nav>;
}
