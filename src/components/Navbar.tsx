"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = ["Home", "About", "Services", "Billboard", "Contact"];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 w-full bg-black/95 backdrop-blur-sm border-b border-white/10">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 lg:px-8 h-[78px]">
        <Link
          href="/"
          className="flex items-center gap-2 text-white no-underline"
        >
          <img src="/logo-main.svg" alt="Kwetu Connect" className="h-[39px] w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const href = item === "Home" ? "/" : `/${item.toLowerCase()}`;
            const isActive = pathname === href;
            return (
              <Link
                key={item}
                href={href}
                className={`text-sm font-medium transition-colors duration-200 no-underline ${
                  isActive ? "text-[#EDB347]" : "text-gray-300 hover:text-[#EDB347]"
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
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#EDB347] text-black font-semibold text-sm tracking-wide hover:bg-[#f5c84d] transition-all duration-200 no-underline"
          >
            Book a Slot
            <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center p-3 text-white hover:text-[#EDB347] transition-colors min-w-[44px] min-h-[44px]"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {mobileOpen && (
        <nav className="md:hidden border-t border-white/10 bg-black/98 fixed top-16 left-0 right-0 z-50">
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
                      ? "text-[#EDB347] bg-white/5"
                      : "text-gray-300 hover:text-[#EDB347] hover:bg-white/5"
                  }`}
                >
                  {item}
                </Link>
              );
            })}
            <Link
              href="/contact"
              onClick={() => setMobileOpen(false)}
              className="group inline-flex items-center justify-center w-full px-5 py-3 rounded-full bg-[#EDB347] text-black font-semibold text-sm tracking-wide hover:bg-[#f5c84d] transition-colors no-underline mt-3"
            >
              Book a Slot
              <svg className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
