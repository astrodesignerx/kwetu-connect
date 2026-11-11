"use client";
import { usePathname } from "next/navigation";
export default function PublicChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/manage") || path === "/book" || path.startsWith("/book/")) return null;
  return children;
}
