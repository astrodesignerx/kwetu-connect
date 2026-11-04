"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquaresFour, ListBullets, CalendarBlank, VideoCamera, Gear } from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
export default function ManagerNav({ adverts }: { adverts: number }) {
  const pathname = usePathname();
  const links = [
    { href: "/manage", label: "Overview", icon: SquaresFour },
    { href: "/manage/bookings", label: "Bookings", icon: ListBullets },
    { href: "/manage/schedule", label: "Schedule", icon: CalendarBlank },
    { href: "/manage/bookings?adverts=1", label: "Adverts", icon: VideoCamera },
    { href: "/manage/settings", label: "Settings", icon: Gear },
  ];
  return <nav className="manager-nav" aria-label="Manager">{links.map(({ href, label, icon: Icon }) => <Tooltip label={label} key={label}><Link href={href} aria-label={label + (label === "Adverts" && adverts ? ", " + adverts + " to check" : "")} aria-current={(href === "/manage" ? pathname === href : !href.includes("?") && pathname.startsWith(href)) ? "page" : undefined}><Icon size={21} aria-hidden="true" />{label === "Adverts" && adverts > 0 && <span className="rail-badge">{adverts}</span>}</Link></Tooltip>)}</nav>;
}
