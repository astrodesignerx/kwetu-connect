"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react";

const LINKS = [{ href: "/terms", label: "Terms" }, { href: "/privacy", label: "Privacy" }, { href: "/contact", label: "Contact KCA" }];

// The links that used to sit in the /book footer. The list stays in the page so it can fade out as well as in.
export default function BookMoreMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  return <div className="book-more" ref={box} onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={button} type="button" className="my-bookings-button book-more-button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>More<CaretDown size={12} weight="bold" aria-hidden="true" /></button>
    <nav id={menuId} className="book-more-menu" data-open={open} aria-label="Terms, privacy and contact">
      {LINKS.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
    </nav>
  </div>;
}
