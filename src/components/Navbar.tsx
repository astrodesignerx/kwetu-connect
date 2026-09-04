"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, List, X } from "@phosphor-icons/react";

const navItems = ["Home", "About", "Services", "Billboard", "Contact"];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    // Lenis scrolls the window, so the native scroll event covers both the
    // smooth-scroll path and the fallback when Lenis isn't available.
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-500 ${
        scrolled
          ? "bg-ink/95 backdrop-blur-sm border-b border-white/10"
          : "bg-transparent backdrop-blur-none border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 lg:px-8 h-[88px]">
        <Link
          href="/"
          className="flex items-center gap-2 text-white no-underline"
        >
          <Image src="/logo-main.svg" alt="Kwetu Connect" width={134} height={41} className="h-[41px] w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const href = item === "Home" ? "/" : `/${item.toLowerCase()}`;
            const isActive = pathname === href;
            return (
              <Link
                key={item}
                href={href}
                data-active={isActive}
                className={`link-underline text-sm font-medium transition-colors duration-200 no-underline ${
                  isActive ? "text-brand-500" : "text-gray-300 hover:text-brand-500"
                }`}
              >
                {item}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <Link
            href="/contact"
            className="group btn-sweep inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline"
          >
            Book a Slot
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center p-3 text-white hover:text-brand-500 transition-colors min-w-[44px] min-h-[44px]"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X size={24} weight="bold" />
          ) : (
            <List size={24} weight="bold" />
          )}
        </button>
      </div>

      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-200 ease-out ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <nav
        inert={!mobileOpen}
        className={`md:hidden border-t border-white/10 bg-black/98 fixed top-[88px] left-0 right-0 z-50 transition-[opacity,translate] duration-200 ease-out ${
          mobileOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
        }`}
      >
          <div className="px-4 py-4 space-y-2">
            {navItems.map((item) => {
              const href = item === "Home" ? "/" : `/${item.toLowerCase()}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={item}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-4 py-3 text-sm font-medium rounded-lg transition-colors no-underline ${
                    isActive
                      ? "text-brand-500 bg-white/5"
                      : "text-gray-300 hover:text-brand-500 hover:bg-white/5"
                  }`}
                >
                  {item}
                </Link>
              );
            })}
            <Link
              href="/contact"
              onClick={() => setMobileOpen(false)}
              className="group btn-sweep inline-flex items-center justify-center w-full px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline mt-3"
            >
              Book a Slot
              <ArrowRight size={14} className="ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" />
            </Link>
          </div>
        </nav>
    </header>
  );
}
