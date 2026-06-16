"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer({ showCTA = true }: { showCTA?: boolean }) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const shouldShowCTA = showCTA && pathname !== "/billboard" && pathname !== "/contact";

  return (
    <footer>
      {shouldShowCTA && (
        <section className="bg-[#E5AD35] py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <h5 className="text-base md:text-xl font-bold font-sans text-black text-center md:text-left">
              {pathname === "/"
                ? "Limited slots available \u2014 book your space today."
                : pathname === "/about"
                ? "Ready to be the brand that cannot be ignored?"
                : "Not sure which tier? We\u2019ll advise you."}
            </h5>
            <Link
              href="/contact"
              className="group btn-sweep flex-shrink-0 inline-flex items-center gap-2 px-8 py-4 rounded-full bg-black text-white text-sm font-semibold whitespace-nowrap hover:text-black transition-all duration-200 no-underline"
            >
              {pathname === "/about" ? "Talk To Us" : pathname === "/services" ? "Request A Quote" : "Get In Touch"}
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>
      )}

      <div className="bg-black py-[60px]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-9 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-3 lg:col-start-1">
            <div className="flex items-start gap-3">
              <img src="/logo-secondary.svg" alt="Kwetu Connect Advertising" className="h-[47.25px] w-auto" />
            </div>
            <p className="text-base md:text-lg font-bold text-white mt-6 leading-[1.15] tracking-tight font-sans">
              Local Focus.{" "}
              <span className="text-[#E5AD35]">Global Reach.</span>
            </p>
            <p className="text-sm text-[#A3A3A3] mt-4 max-w-xs">
              Eldoret&apos;s premier LED billboard advertising platform &mdash;
              putting brands where they can&apos;t be ignored.
            </p>
          </div>

          <div className="lg:col-span-2 lg:col-start-4">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Quick Links
            </span>
            <nav className="flex flex-col gap-4">
              {[
                { label: "About", href: "/about" },
                { label: "Services", href: "/services" },
                { label: "Billboard", href: "/billboard" },
                { label: "Contact", href: "/contact" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-white text-sm hover:text-[#E5AD35] transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="lg:col-span-2 lg:col-start-6 lg:translate-x-[-40px]">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Contact
            </span>
            <div className="flex flex-col gap-4">
              <a
                href="tel:+254739857576"
                className="text-white text-sm hover:text-[#E5AD35] transition-colors no-underline"
              >
                +254 739 857 576
              </a>
              <a
                href="mailto:info@kwetuconnectadvertising.co.ke"
                className="text-white text-sm hover:text-[#E5AD35] transition-colors no-underline"
              >
                info@kwetuconnectadvertising.co.ke
              </a>
              <span className="text-white text-sm">Eldoret, Kenya</span>
              <span className="text-white text-sm">P.O Box 8698-30100</span>
            </div>
          </div>

          <div className="lg:col-span-2 lg:col-start-8">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Location
            </span>
            <div className="flex flex-col gap-4 text-white text-sm">
              <span>Kisumu Ndogo Rd</span>
              <span>Near Langas Junction</span>
              <span>Eldoret, Kenya</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-black border-t border-[#2A2A2A] py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="text-[0.6rem] sm:text-xs text-[#A3A3A3] uppercase tracking-wider text-center sm:text-left">
            &copy; {year} Kwetu Connect Advertising.
          </p>
          <p className="text-[0.55rem] sm:text-xs text-[#A3A3A3] uppercase tracking-wider text-center sm:text-left">
            All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
