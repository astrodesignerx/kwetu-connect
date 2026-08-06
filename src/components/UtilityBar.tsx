"use client";

import { useEffect, useState } from "react";

export default function UtilityBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`hidden md:block sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-black/95 backdrop-blur-sm border-b border-white/10"
          : "bg-transparent backdrop-blur-none border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-10 flex items-center justify-between gap-6 text-xs text-gray-400">
        <p className="truncate">Kisumu Ndogo Rd, Eldoret</p>
        <div className="flex items-center gap-6 shrink-0">
          <a
            href="tel:+254729911021"
            className="hover:text-brand-400 transition-colors no-underline"
          >
            +254 729 911 021
          </a>
          <a
            href="mailto:info@kwetuconnectads.co.ke"
            className="hidden lg:inline hover:text-brand-400 transition-colors no-underline"
          >
            info@kwetuconnectads.co.ke
          </a>
        </div>
      </div>
    </div>
  );
}
