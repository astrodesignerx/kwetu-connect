"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import ThemeSwitch from "@/components/workspace/ThemeSwitch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function ManagerTopbar({ greeting, date }: { greeting: string; date: string }) {
  const search = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); search.current?.focus(); } };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  return <header className="manager-topbar"><div><h1>{greeting}</h1><p>{date}</p></div><form action="/manage/bookings" className="manager-search" role="search"><MagnifyingGlass size={16} aria-hidden="true" /><Input ref={search} key={params.get("q")} name="q" aria-label="Search bookings by reference or business" placeholder="Reference or business" defaultValue={params.get("q") ?? ""} /><kbd>Ctrl K</kbd><button type="submit" className="sr-only focus:not-sr-only">Search</button></form><Button asChild size="sm"><Link href="/book"><Plus size={16} aria-hidden="true" />New quote</Link></Button><ThemeSwitch /></header>;
}
