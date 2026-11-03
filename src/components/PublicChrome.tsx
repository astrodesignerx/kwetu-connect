"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
export default function PublicChrome({ children, footer = false, hideBooking = false }: { children: React.ReactNode; footer?: boolean; hideBooking?: boolean }) {
  const path = usePathname();
  if (path.startsWith("/manage")) return null;
  if (path === "/book" || path.startsWith("/book/")) {
    if (hideBooking) return null;
    if (footer) return <footer className="booking-footer"><span>Kwetu Connect Advertising</span><div><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact KCA</Link></div></footer>;
  }
  return children;
}
